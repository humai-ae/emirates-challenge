import type { OpinionCode } from "@hrcc/shared";
import { Column, Entity, PrimaryColumn } from "typeorm";

/** Where Jev strongly disagrees with a rule's check on a transaction: never a finding. */
@Entity({ name: "second_opinions" })
export class SecondOpinionEntity {
  @PrimaryColumn({ type: "uuid" })
  id: string;

  @Column({ name: "run_id", type: "text" })
  runId: string;

  @Column({ name: "rule_id", type: "text" })
  ruleId: string;

  @Column({ name: "rule_version", type: "integer" })
  ruleVersion: number;

  @Column({ name: "row_no", type: "integer" })
  rowNo: number;

  @Column({ name: "transaction_id", type: "text", nullable: true })
  transactionId: string | null;

  @Column({ type: "text" })
  code: OpinionCode;

  @Column({ name: "p_break", type: "double precision" })
  pBreak: number;

  @Column({ name: "p_enough", type: "double precision" })
  pEnough: number;

  @Column({ type: "double precision" })
  strength: number;

  @Column({ name: "noted_by", type: "uuid", nullable: true })
  notedBy: string | null;

  @Column({ name: "noted_at", type: "timestamptz", nullable: true })
  notedAt: Date | null;

  @Column({ name: "review_requested_by", type: "uuid", nullable: true })
  reviewRequestedBy: string | null;

  @Column({ name: "review_requested_at", type: "timestamptz", nullable: true })
  reviewRequestedAt: Date | null;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
