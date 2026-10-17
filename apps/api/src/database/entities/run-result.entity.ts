import type { JudgmentDecision } from "@hrcc/engine";
import type {
  Evidence,
  JudgmentAnswers,
  MissingField,
  Restatement,
  RunResultOutcome,
  Severity,
} from "@hrcc/shared";
import { Column, Entity, PrimaryColumn } from "typeorm";

/** How AI judged a judgment rule's text: kept on a finding, and on a text too thin to judge. */
export interface ResultJudgment {
  decision: JudgmentDecision;
  pBreak: number;
  confidence: Severity | null;
  answers: JudgmentAnswers;
  model: string;
  /** The text model's restatement, when it restated the text once; absent on older results. */
  restatement?: Restatement | null;
  /** The column AI read, and its text. */
  field: string;
  text: string;
}

/** A result as stored: a finding, a transaction that couldn't be checked, or a text AI must read. */
export type StoredOutcome = RunResultOutcome | "needs_judgment";

/** A finding, a transaction a rule couldn't check, or one AI must read, with what the export needs. */
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
  outcome: StoredOutcome;

  /** 1, 2, … for the run's findings; null for could-not-check. */
  @Column({ name: "finding_no", type: "integer", nullable: true })
  findingNo: number | null;

  @Column({ type: "jsonb" })
  evidence: Evidence[];

  @Column({ type: "jsonb" })
  missing: MissingField[];

  @Column({ type: "text", nullable: true })
  error: string | null;

  @Column({ type: "jsonb", nullable: true })
  judgment: ResultJudgment | null;
}
