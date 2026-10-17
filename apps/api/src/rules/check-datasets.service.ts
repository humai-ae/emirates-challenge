import { createHash } from "node:crypto";
import {
  type ColumnSpec,
  datasetVocabulary,
  type PreparedDataset,
  prepareDataset,
} from "@hrcc/engine";
import type { RulesDataset } from "@hrcc/shared";
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource, FindOptionsWhere } from "typeorm";
import { DatasetColumnEntity, DatasetEntity } from "../database/entities/index.js";

/** The newest ready dataset, prepared for checks, and what the rule screens show of it. */
export interface LoadedDataset {
  id: string;
  prepared: PreparedDataset;
  info: RulesDataset;
}

function specOf(column: DatasetColumnEntity): ColumnSpec {
  return {
    file: column.file,
    name: column.name,
    position: column.position,
    type: column.type,
    role: column.role,
    dateFormat: column.profile.dateFormat as ColumnSpec["dateFormat"],
    listDelimiter: column.profile.listDelimiter as ColumnSpec["listDelimiter"],
  };
}

/**
 * Rules are drafted, previewed and approved against the newest ready dataset. Reading a large one
 * takes a moment, so the prepared copy is kept until another dataset becomes the newest or the
 * columns change (confirming roles changes them).
 */
@Injectable()
export class CheckDatasetsService {
  private cached: { key: string; loaded: LoadedDataset } | null = null;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async latest(): Promise<LoadedDataset | null> {
    return this.load({ status: "ready" });
  }

  /** A run's dataset, while it is still there: a deleted one has no rows left. */
  async byId(id: string): Promise<LoadedDataset | null> {
    return this.load({ id, status: "ready" });
  }

  private async load(where: FindOptionsWhere<DatasetEntity>): Promise<LoadedDataset | null> {
    // One snapshot, so the columns and rows read belong together.
    return this.dataSource.transaction("REPEATABLE READ", async (manager) => {
      const dataset = await manager.findOne(DatasetEntity, {
        where,
        order: { createdAt: "DESC", id: "ASC" },
      });
      if (!dataset) return null;
      const columns = await manager.find(DatasetColumnEntity, {
        where: { datasetId: dataset.id },
        order: { file: "ASC", position: "ASC" },
      });
      const specs = columns.map(specOf);
      const key = createHash("sha256")
        .update(JSON.stringify([dataset.id, specs]))
        .digest("hex");
      if (this.cached?.key === key) return this.cached.loaded;
      const rows = (table: string): Promise<Array<{ data: Record<string, string> }>> =>
        manager.query(`SELECT data FROM ${table} WHERE dataset_id = $1 ORDER BY row_no`, [
          dataset.id,
        ]);
      const transactions = await rows("transactions");
      const employees = await rows("employees");
      const prepared = prepareDataset({
        columns: specs,
        transactions: transactions.map((row) => row.data),
        employees: employees.map((row) => row.data),
      });
      const loaded: LoadedDataset = {
        id: dataset.id,
        prepared,
        info: {
          id: dataset.id,
          name: dataset.name,
          transactionCount: dataset.transactionCount,
          columns: specs
            .filter((spec) => spec.file === "transactions")
            .map(({ name, type, role }) => ({ name, type, role })),
          vocabulary: datasetVocabulary(prepared),
        },
      };
      this.cached = { key, loaded };
      return loaded;
    });
  }
}
