import { createHash, randomUUID } from "node:crypto";
import { learnValues, proposeMapping, readCsv } from "@hrcc/engine";
import type { ConfirmMappingRequest, FindingFormatResponse, User } from "@hrcc/shared";
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
import { actorOf } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { ApiException } from "../common/api-exception.js";
import { FindingFormatEntity } from "../database/entities/index.js";
import { toFindingFormat } from "./finding-format-dto.js";

/** At most this many worked examples are kept. */
const MAX_EXAMPLES = 20;
const RELATIONS = { uploadedBy: true, confirmedBy: true } as const;

/** What multer (memory storage) hands over for the uploaded format. */
export interface UploadedFormat {
  originalname: string;
  buffer: Buffer;
}

@Injectable()
export class FindingFormatsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** Reads the header and worked examples, and proposes a field for each column. */
  async upload(admin: User, file: UploadedFormat | undefined): Promise<FindingFormatResponse> {
    if (!file) throw new ApiException(400, "file_missing", { file: "format" });
    if (!/\.csv$/i.test(file.originalname)) {
      throw new ApiException(400, "file_type_not_allowed", { file: "format" });
    }
    const read = readCsv(file.buffer);
    if (!read.ok) {
      throw new ApiException(400, "file_unreadable", { file: "format", reason: read.reason });
    }
    const columns = read.table.header;
    const examples = read.table.rows.slice(0, MAX_EXAMPLES).map((row) => [...row]);
    const mapping = proposeMapping(columns);
    const id = randomUUID();
    await this.dataSource.transaction(async (manager) => {
      await manager.insert(FindingFormatEntity, {
        id,
        filename: file.originalname,
        sizeBytes: file.buffer.byteLength,
        sha256: createHash("sha256").update(file.buffer).digest("hex"),
        columns,
        examples,
        mapping,
        values: learnValues(examples, mapping),
        rowVersion: 1,
        uploadedById: admin.id,
        confirmedById: null,
        confirmedAt: null,
      });
      await this.audit.append(manager, {
        actor: actorOf(admin),
        action: "format.upload",
        objectType: "finding_format",
        objectId: id,
        after: { name: file.originalname, columns, mapping },
      });
    });
    return { format: toFindingFormat(await this.byId(id)) };
  }

  /** The newest upload, confirmed or not. */
  async current(): Promise<FindingFormatResponse> {
    const format = await this.newest();
    return { format: format ? toFindingFormat(format) : null };
  }

  /** The newest upload, when its mapping is confirmed: what exports and worked examples use. */
  async confirmed(): Promise<FindingFormatEntity | null> {
    const format = await this.newest();
    return format?.confirmedAt ? format : null;
  }

  async confirm(
    admin: User,
    id: string,
    body: ConfirmMappingRequest,
  ): Promise<FindingFormatResponse> {
    await this.dataSource.transaction(async (manager) => {
      const format = await manager.findOne(FindingFormatEntity, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!format) throw new ApiException(404, "not_found");
      if (format.rowVersion !== body.rowVersion) throw new ApiException(409, "conflict");
      if (body.mapping.length !== format.columns.length) {
        throw new ApiException(400, "validation_failed", {
          issues: [{ path: "mapping", code: "custom", message: "wrong_length" }],
        });
      }
      await manager.update(
        FindingFormatEntity,
        { id },
        {
          mapping: body.mapping,
          values: learnValues(format.examples, body.mapping),
          confirmedById: admin.id,
          confirmedAt: new Date(),
          rowVersion: format.rowVersion + 1,
        },
      );
      await this.audit.append(manager, {
        actor: actorOf(admin),
        action: "format.mapping_confirm",
        objectType: "finding_format",
        objectId: id,
        before: { mapping: format.mapping },
        after: { name: format.filename, mapping: body.mapping },
      });
    });
    return { format: toFindingFormat(await this.byId(id)) };
  }

  private async newest(): Promise<FindingFormatEntity | null> {
    const [format] = await this.dataSource.getRepository(FindingFormatEntity).find({
      relations: RELATIONS,
      order: { createdAt: "DESC", id: "ASC" },
      take: 1,
    });
    return format ?? null;
  }

  private byId(id: string): Promise<FindingFormatEntity> {
    return this.dataSource
      .getRepository(FindingFormatEntity)
      .findOneOrFail({ where: { id }, relations: RELATIONS });
  }
}
