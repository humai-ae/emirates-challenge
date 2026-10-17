import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, In } from "typeorm";
import { AiCacheEntity } from "../database/entities/index.js";

/** Jev's answers by the SHA-256 of what was asked: the same text is judged once. */
@Injectable()
export class AiCacheService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async get(keys: readonly string[]): Promise<Map<string, Record<string, unknown>>> {
    if (keys.length === 0) return new Map();
    const rows = await this.dataSource
      .getRepository(AiCacheEntity)
      .findBy({ key: In([...keys]), kind: "judgment" });
    return new Map(rows.map((row) => [row.key, row.response]));
  }

  /** Keeps answers; one already kept stays as it is. */
  async put(
    entries: ReadonlyArray<{ key: string; response: Record<string, unknown> }>,
  ): Promise<void> {
    if (entries.length === 0) return;
    await this.dataSource.query(
      `INSERT INTO ai_cache (key, kind, response)
       SELECT r.key, 'judgment', r.response
       FROM jsonb_to_recordset($1::jsonb) AS r(key text, response jsonb)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify(entries)],
    );
  }
}
