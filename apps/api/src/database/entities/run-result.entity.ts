import type { Evidence, MissingField, RunResultOutcome } from "@hrcc/shared";
import { Column, Entity, PrimaryColumn } from "typeorm";

/** A finding, or a transaction a rule couldn't check, with what the export needs of the row. */
@Entity({ name: "run_results" })
export class RunResultEntity {
  @PrimaryColumn({ name: "run_id", type: "text" })
  runId: string;

  /** Rules in ID order, transactions in file order. */
  @PrimaryColumn({ type: "integer" })
  seq: number;

  @Column({ name: "rule_id", type: "text" })
  ruleId: string;

  @Column({ name: "rule_version", type: "integer" })
  ruleVersion: number;

  @Column({ name: "row_no", type: "integer" })
  rowNo: number;

  @Column({ name: "transaction_id", type: "text", nullable: true })
  transactionId: string | null;

  @Column({ name: "employee_id", type: "text", nullable: true })
  employeeId: string | null;

  @Column({ name: "transaction_type", type: "text", nullable: true })
  transactionType: string | null;

  @Column({ type: "text", nullable: true })
  department: string | null;

  /** `YYYY-MM-DD`. */
  @Column({ name: "effective_date", type: "date", nullable: true })
  effectiveDate: string | null;

  @Column({ type: "text", nullable: true })
  amount: string | null;

  @Column({ type: "text" })
  outcome: RunResultOutcome;

  /** 1, 2, … for the run's findings; null for could-not-check. */
  @Column({ name: "finding_no", type: "integer", nullable: true })
  findingNo: number | null;

  @Column({ type: "jsonb" })
  evidence: Evidence[];

  @Column({ type: "jsonb" })
  missing: MissingField[];

  @Column({ type: "text", nullable: true })
  error: string | null;
}
