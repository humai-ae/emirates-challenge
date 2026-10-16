import type {
  AuditAction,
  AuditAi,
  AuditEvent,
  AuditListQuery,
  AuditListResponse,
} from "@hrcc/shared";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { type EntityManager, type QueryDeepPartialEntity, Repository } from "typeorm";
import { AuditEventEntity } from "../database/entities/index.js";
import type { Actor } from "./actor.js";
import { computeEventHash, GENESIS_HASH, type HashableEvent } from "./hash.js";

/** Serialises appends across all connections (pg_advisory_xact_lock key). */
export const AUDIT_LOCK_KEY = 482_017;
/** Events per INSERT. */
const INSERT_CHUNK = 500;

export interface AuditInput {
  actor: Actor;
  action: AuditAction;
  objectType: string;
  objectId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ai?: AuditAi | null;
}

/** Round-trip through JSON so the hashed value equals what jsonb returns later. */
function toJsonValue(value: unknown): unknown {
  return value === undefined || value === null ? null : JSON.parse(JSON.stringify(value));
}

export function formatEventId(seq: number): string {
  return `EV-${String(seq).padStart(7, "0")}`;
}

function toHashable(row: AuditEventEntity): HashableEvent {
  return {
    seq: Number(row.seq),
    eventId: row.eventId,
    at: row.at.toISOString(),
    actorId: row.actorId,
    actorName: row.actorName,
    role: row.role,
    action: row.action,
    objectType: row.objectType,
    objectId: row.objectId,
    before: row.before ?? null,
    after: row.after ?? null,
    reason: row.reason,
    ai: row.ai ?? null,
    prevHash: row.prevHash,
  };
}

function toDto(row: AuditEventEntity): AuditEvent {
  const event = toHashable(row);
  return {
    ...event,
    action: event.action as AuditAction,
    ai: (event.ai as AuditAi | null) ?? null,
    hash: row.hash,
  };
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEventEntity) private readonly events: Repository<AuditEventEntity>,
  ) {}

  /** Call inside the transaction that performs the action. */
  async append(
    manager: EntityManager,
    input: AuditInput,
    now: Date = new Date(),
  ): Promise<AuditEvent> {
    const [event] = await this.write(manager, [input], now);
    if (!event) throw new Error("The audit event was not written");
    return event;
  }

  /** Several events in one go, each its own step of the chain, in order. Call inside the transaction. */
  async appendMany(
    manager: EntityManager,
    inputs: readonly AuditInput[],
    now: Date = new Date(),
  ): Promise<void> {
    await this.write(manager, inputs, now);
  }

  private async write(
    manager: EntityManager,
    inputs: readonly AuditInput[],
    now: Date,
  ): Promise<AuditEvent[]> {
    if (inputs.length === 0) return [];
    await manager.query("SELECT pg_advisory_xact_lock($1)", [AUDIT_LOCK_KEY]);
    const seqs: Array<{ seq: string }> = await manager.query(
      "SELECT nextval('audit_events_seq') AS seq FROM generate_series(1, $1) ORDER BY 1",
      [inputs.length],
    );
    const last: Array<{ hash: string }> = await manager.query(
      "SELECT hash FROM audit_events ORDER BY seq DESC LIMIT 1",
    );
    let prevHash = last[0]?.hash ?? GENESIS_HASH;
    const rows = inputs.map((input, index) => {
      const seq = Number(seqs[index]?.seq);
      const event: HashableEvent = {
        seq,
        eventId: formatEventId(seq),
        at: now.toISOString(),
        actorId: input.actor.id,
        actorName: input.actor.name,
        role: input.actor.role,
        action: input.action,
        objectType: input.objectType,
        objectId: input.objectId,
        before: toJsonValue(input.before),
        after: toJsonValue(input.after),
        reason: input.reason ?? null,
        ai: toJsonValue(input.ai),
        prevHash,
      };
      const hash = computeEventHash(event);
      prevHash = hash;
      return manager.create(AuditEventEntity, { ...event, seq: String(seq), at: now, hash });
    });
    for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
      // TypeORM's insert type maps `unknown` jsonb columns to `{}`; the rows are complete entities.
      await manager.insert(
        AuditEventEntity,
        rows.slice(start, start + INSERT_CHUNK) as QueryDeepPartialEntity<AuditEventEntity>[],
      );
    }
    return rows.map(toDto);
  }

  async list(query: AuditListQuery): Promise<AuditListResponse> {
    const builder = this.events
      .createQueryBuilder("event")
      .orderBy("event.seq", "DESC")
      .limit(query.limit + 1);
    if (query.before !== undefined)
      builder.andWhere("event.seq < :before", { before: query.before });
    if (query.actorId) builder.andWhere("event.actorId = :actorId", { actorId: query.actorId });
    if (query.action) builder.andWhere("event.action = :action", { action: query.action });
    if (query.objectId)
      builder.andWhere("event.objectId = :objectId", { objectId: query.objectId });
    const rows = await builder.getMany();
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      events: page.map(toDto),
      nextBefore: rows.length > query.limit && last ? Number(last.seq) : null,
    };
  }

  async verifyChain(
    batchSize = 1_000,
  ): Promise<{ ok: true; count: number } | { ok: false; count: number; brokenAt: string }> {
    let prevHash = GENESIS_HASH;
    let lastSeq = "0";
    let count = 0;
    for (;;) {
      const rows = await this.events
        .createQueryBuilder("event")
        .where("event.seq > :lastSeq", { lastSeq })
        .orderBy("event.seq", "ASC")
        .limit(batchSize)
        .getMany();
      if (rows.length === 0) return { ok: true, count };
      for (const row of rows) {
        if (row.prevHash !== prevHash || computeEventHash(toHashable(row)) !== row.hash) {
          return { ok: false, count, brokenAt: row.eventId };
        }
        prevHash = row.hash;
        lastSeq = row.seq;
        count += 1;
      }
    }
  }
}
