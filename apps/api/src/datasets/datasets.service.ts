import { createHash, randomUUID } from "node:crypto";
import { analyzeDataset, type CsvTable, readCsv, rowsForStorage } from "@hrcc/engine";
import type {
  DatasetDetail,
  DatasetFileKind,
  DatasetResponse,
  UploadDatasetFields,
  User,
} from "@hrcc/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { actorOf } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { ApiException } from "../common/api-exception.js";
import {
  DatasetColumnEntity,
  DatasetEntity,
  DatasetFileEntity,
} from "../database/entities/index.js";
import { FILE_STORE, type FileStore, FileStoreError } from "../storage/file-store.js";
import { toDatasetDetail } from "./dataset-dto.js";
import { columnEntities, insertRows, storagePath } from "./dataset-rows.js";

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
    const name =
      fields.name ||
      transactions.filename
        .replace(/\.csv$/i, "")
        .trim()
        .slice(0, 120) ||
      "Dataset";
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
