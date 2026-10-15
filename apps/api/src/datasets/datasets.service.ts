import { createHash, randomUUID } from "node:crypto";
import { analyzeDataset, type CsvTable, readCsv, rowsForStorage } from "@hrcc/engine";
import {
  type ConfirmRolesRequest,
  DATASET_FILE_KINDS,
  type DatasetDetail,
  type DatasetFileKind,
  type DatasetResponse,
  type DatasetsListResponse,
  type UploadDatasetFields,
  type User,
} from "@hrcc/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, type EntityManager } from "typeorm";
import { actorOf } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { ApiException } from "../common/api-exception.js";
import {
  DatasetColumnEntity,
  DatasetEntity,
  DatasetFileEntity,
} from "../database/entities/index.js";
import { FILE_STORE, type FileStore, FileStoreError } from "../storage/file-store.js";
import { toDatasetDetail, toDatasetSummary } from "./dataset-dto.js";
import { columnEntities, deleteRows, insertRows, storagePath } from "./dataset-rows.js";

/** What multer (memory storage) hands over for an uploaded file. */
export interface UploadedCsv {
  originalname: string;
  buffer: Buffer;
}

interface IncomingFile {
  kind: DatasetFileKind;
  filename: string;
  bytes: Uint8Array;
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function incoming(kind: DatasetFileKind, upload: UploadedCsv | undefined): IncomingFile {
  if (!upload) throw new ApiException(400, "file_missing", { file: kind });
  if (!/\.csv$/i.test(upload.originalname)) {
    throw new ApiException(400, "file_type_not_allowed", { file: kind });
  }
  return { kind, filename: upload.originalname, bytes: upload.buffer };
}

/** The same columns for the same roles; order within a role doesn't matter. */
function sameMapping(a: ConfirmRolesRequest, b: ConfirmRolesRequest): boolean {
  const canonical = (mapping: ConfirmRolesRequest) =>
    JSON.stringify(
      DATASET_FILE_KINDS.map((file) =>
        Object.entries(mapping[file])
          .map(([role, columns = []]) => [role, [...columns].sort()] as const)
          .filter(([, columns]) => columns.length > 0)
          .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)),
      ),
    );
  return canonical(a) === canonical(b);
}

const DUBAI_OFFSET_MS = 4 * 3_600_000;

/**
 * An unnamed dataset is named after both its files and the upload time in Dubai, so a list of
 * uploads of similar files still tells them apart. Locale-neutral, as it is stored as data.
 */
function defaultName(transactions: IncomingFile, employees: IncomingFile, now: Date): string {
  const time = new Date(now.getTime() + DUBAI_OFFSET_MS)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
  return `${transactions.filename} + ${employees.filename} · ${time}`.slice(-120);
}

function parse(file: IncomingFile): CsvTable {
  const result = readCsv(file.bytes);
  if (!result.ok) {
    throw new ApiException(400, "file_unreadable", { file: file.kind, reason: result.reason });
  }
  return result.table;
}

@Injectable()
export class DatasetsService {
  private readonly logger = new Logger(DatasetsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(FILE_STORE) private readonly files: FileStore,
    private readonly audit: AuditService,
  ) {}

  async upload(
    admin: User,
    fields: UploadDatasetFields,
    uploads: { transactions?: UploadedCsv; employees?: UploadedCsv },
  ): Promise<DatasetResponse> {
    if (uploads.employees && fields.employeesFromDatasetId) {
      throw new ApiException(400, "validation_failed", {
        issues: [{ path: "employeesFromDatasetId", code: "custom", message: "choose_one" }],
      });
    }
    const transactions = incoming("transactions", uploads.transactions);
    const employees = fields.employeesFromDatasetId
      ? await this.previousEmployees(fields.employeesFromDatasetId)
      : incoming("employees", uploads.employees);
    const tables = { transactions: parse(transactions), employees: parse(employees) };
    const analysis = analyzeDataset(tables);
    const rows = rowsForStorage(analysis, tables);

    const id = randomUUID();
    const name = fields.name || defaultName(transactions, employees, new Date());
    const stored = [transactions, employees].map((file) => ({
      ...file,
      path: storagePath(id, file.kind),
      sha256: sha256(file.bytes),
    }));

    const written: string[] = [];
    try {
      for (const file of stored) {
        await this.files.put(file.path, file.bytes, "text/csv");
        written.push(file.path);
      }
    } catch (error) {
      await this.removeQuietly(written);
      throw this.storageFailure(error);
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.insert(DatasetEntity, {
          id,
          name,
          status: analysis.status,
          rejection: analysis.rejection,
          transactionCount: analysis.summary.transactionCount,
          employeeCount: analysis.summary.employeeCount,
          periodFrom: analysis.summary.periodFrom,
          periodTo: analysis.summary.periodTo,
          issues: analysis.issues,
          columnsConfirmed: false,
          createdById: admin.id,
          deletedAt: null,
        });
        await manager.insert(
          DatasetFileEntity,
          stored.map((file) => ({
            datasetId: id,
            kind: file.kind,
            filename: file.filename,
            sizeBytes: file.bytes.byteLength,
            sha256: file.sha256,
            storagePath: file.path,
          })),
        );
        await manager.insert(DatasetColumnEntity, columnEntities(id, analysis, false));
        await insertRows(manager, id, rows);
        await this.audit.append(manager, {
          actor: actorOf(admin),
          action: "dataset.upload",
          objectType: "dataset",
          objectId: id,
          after: {
            name,
            status: analysis.status,
            transactionCount: analysis.summary.transactionCount,
            employeeCount: analysis.summary.employeeCount,
            files: stored.map((file) => ({
              kind: file.kind,
              filename: file.filename,
              sha256: file.sha256,
            })),
          },
        });
      });
    } catch (error) {
      await this.removeQuietly(written);
      throw error;
    }
    return { dataset: await this.detail(id) };
  }

  async detail(id: string): Promise<DatasetDetail> {
    const dataset = await this.dataSource
      .getRepository(DatasetEntity)
      .findOne({ where: { id }, relations: { createdBy: true } });
    if (!dataset) throw new ApiException(404, "not_found");
    const [files, columns] = await Promise.all([
      this.dataSource.getRepository(DatasetFileEntity).findBy({ datasetId: id }),
      this.dataSource.getRepository(DatasetColumnEntity).findBy({ datasetId: id }),
    ]);
    return toDatasetDetail(dataset, files, columns);
  }

  async list(): Promise<DatasetsListResponse> {
    const datasets = await this.dataSource.getRepository(DatasetEntity).find({
      relations: { createdBy: true },
      order: { createdAt: "DESC", id: "ASC" },
    });
    return { datasets: datasets.map(toDatasetSummary) };
  }

  /** Re-analyses the stored files with exactly the admin's mapping, and rebuilds the rows. */
  async confirmRoles(
    admin: User,
    id: string,
    mapping: ConfirmRolesRequest,
  ): Promise<DatasetResponse> {
    const dataset = await this.dataSource.getRepository(DatasetEntity).findOneBy({ id });
    if (!dataset) throw new ApiException(404, "not_found");
    if (dataset.status === "deleted") throw new ApiException(409, "dataset_deleted");
    if (
      dataset.columnsConfirmed &&
      sameMapping(await this.mappingOf(this.dataSource.manager, id), mapping)
    ) {
      // Nothing changed: no re-read, no rebuild and no second audit entry.
      return { dataset: await this.detail(id) };
    }
    const tables = await this.storedTables(id);
    for (const file of DATASET_FILE_KINDS) {
      for (const columns of Object.values(mapping[file])) {
        for (const column of columns ?? []) {
          if (!tables[file].header.includes(column)) {
            throw new ApiException(400, "unknown_column", { file, column });
          }
        }
      }
    }
    const analysis = analyzeDataset({ ...tables, roles: mapping });
    const rows = rowsForStorage(analysis, tables);
    await this.dataSource.transaction(async (manager) => {
      const current = await this.lock(manager, id);
      if (current.status === "deleted") throw new ApiException(409, "dataset_deleted");
      const before = await this.mappingOf(manager, id);
      await manager.update(
        DatasetEntity,
        { id },
        {
          status: analysis.status,
          rejection: analysis.rejection,
          transactionCount: analysis.summary.transactionCount,
          employeeCount: analysis.summary.employeeCount,
          periodFrom: analysis.summary.periodFrom,
          periodTo: analysis.summary.periodTo,
          issues: analysis.issues,
          columnsConfirmed: true,
        },
      );
      await manager.delete(DatasetColumnEntity, { datasetId: id });
      await manager.insert(DatasetColumnEntity, columnEntities(id, analysis, true));
      await deleteRows(manager, id);
      await insertRows(manager, id, rows);
      await this.audit.append(manager, {
        actor: actorOf(admin),
        action: "dataset.columns_confirm",
        objectType: "dataset",
        objectId: id,
        before: { roles: before },
        after: { name: current.name, status: analysis.status, roles: mapping },
      });
    });
    return { dataset: await this.detail(id) };
  }

  /**
   * Removes the stored files first, so a Storage failure changes nothing and the admin can try
   * again; then the rows and every value copied from the files. The record, column names, file
   * hashes and audit trail stay.
   */
  async remove(admin: User, id: string): Promise<DatasetResponse> {
    const dataset = await this.dataSource.getRepository(DatasetEntity).findOneBy({ id });
    if (!dataset) throw new ApiException(404, "not_found");
    if (dataset.status !== "deleted") {
      const files = await this.dataSource
        .getRepository(DatasetFileEntity)
        .findBy({ datasetId: id });
      const paths = files.flatMap((file) => (file.storagePath ? [file.storagePath] : []));
      try {
        await this.files.remove(paths);
      } catch (error) {
        throw this.storageFailure(error);
      }
      await this.dataSource.transaction(async (manager) => {
        const current = await this.lock(manager, id);
        if (current.status === "deleted") return;
        await deleteRows(manager, id);
        await manager.update(DatasetFileEntity, { datasetId: id }, { storagePath: null });
        await manager.query(
          `UPDATE dataset_columns
           SET profile = profile || '{"samples": [], "min": null, "max": null}'::jsonb
           WHERE dataset_id = $1`,
          [id],
        );
        await manager.update(
          DatasetEntity,
          { id },
          {
            status: "deleted",
            deletedAt: new Date(),
            issues: current.issues.map((issue) => ({ ...issue, examples: [] })),
          },
        );
        await this.audit.append(manager, {
          actor: actorOf(admin),
          action: "dataset.delete",
          objectType: "dataset",
          objectId: id,
          after: { name: current.name },
        });
      });
    }
    return { dataset: await this.detail(id) };
  }

  /** The dataset row, locked until the transaction ends. */
  private async lock(manager: EntityManager, id: string): Promise<DatasetEntity> {
    const dataset = await manager.findOne(DatasetEntity, {
      where: { id },
      lock: { mode: "pessimistic_write" },
    });
    if (!dataset) throw new ApiException(404, "not_found");
    return dataset;
  }

  private async mappingOf(manager: EntityManager, id: string): Promise<ConfirmRolesRequest> {
    const columns = await manager.find(DatasetColumnEntity, {
      where: { datasetId: id },
      order: { position: "ASC" },
    });
    const mapping: ConfirmRolesRequest = { transactions: {}, employees: {} };
    for (const column of columns) {
      if (!column.role) continue;
      const roles = mapping[column.file] as Record<string, string[]>;
      roles[column.role] = [...(roles[column.role] ?? []), column.name];
    }
    return mapping;
  }

  /** Both files of a dataset, read back from Storage. */
  private async storedTables(id: string): Promise<Record<DatasetFileKind, CsvTable>> {
    const files = await this.dataSource.getRepository(DatasetFileEntity).findBy({ datasetId: id });
    const read = async (kind: DatasetFileKind): Promise<CsvTable> => {
      const file = files.find((candidate) => candidate.kind === kind);
      if (!file?.storagePath) throw new ApiException(409, "dataset_deleted");
      let bytes: Uint8Array;
      try {
        bytes = await this.files.get(file.storagePath);
      } catch (error) {
        throw this.storageFailure(error);
      }
      return parse({ kind, filename: file.filename, bytes });
    };
    const [transactions, employees] = await Promise.all([read("transactions"), read("employees")]);
    return { transactions, employees };
  }

  /** The employees file of an earlier dataset, read back from Storage. */
  private async previousEmployees(datasetId: string): Promise<IncomingFile> {
    const file = await this.dataSource
      .getRepository(DatasetFileEntity)
      .findOneBy({ datasetId, kind: "employees" });
    if (!file) throw new ApiException(404, "not_found");
    if (!file.storagePath) throw new ApiException(409, "dataset_deleted");
    try {
      return {
        kind: "employees",
        filename: file.filename,
        bytes: await this.files.get(file.storagePath),
      };
    } catch (error) {
      throw this.storageFailure(error);
    }
  }

  /** Storage problems become a 503 (logged without any credentials); anything else is a bug. */
  private storageFailure(error: unknown): unknown {
    if (!(error instanceof FileStoreError)) return error;
    this.logger.error(error.message);
    return new ApiException(503, "storage_unavailable");
  }

  private async removeQuietly(paths: readonly string[]): Promise<void> {
    if (paths.length === 0) return;
    try {
      await this.files.remove(paths);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not remove ${paths.join(", ")} after a failed upload: ${reason}`);
    }
  }
}
