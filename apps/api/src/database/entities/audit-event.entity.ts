import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "audit_events" })
export class AuditEventEntity {
  /** bigint arrives from Postgres as a string. */
  @PrimaryColumn({ type: "bigint" })
  seq: string;

  @Column({ name: "event_id", type: "text", unique: true })
  eventId: string;

  @Column({ type: "timestamptz" })
  at: Date;

  @Column({ name: "actor_id", type: "text" })
  actorId: string;

  @Column({ name: "actor_name", type: "text" })
  actorName: string;

  @Column({ type: "text" })
  role: string;

  @Column({ type: "text" })
  action: string;

  @Column({ name: "object_type", type: "text" })
  objectType: string;

  @Column({ name: "object_id", type: "text" })
  objectId: string;

  @Column({ type: "jsonb", nullable: true })
  before: unknown;

  @Column({ type: "jsonb", nullable: true })
  after: unknown;

  @Column({ type: "text", nullable: true })
  reason: string | null;

  @Column({ type: "jsonb", nullable: true })
  ai: unknown;

  @Column({ name: "prev_hash", type: "text" })
  prevHash: string;

  @Column({ type: "text" })
  hash: string;
}
