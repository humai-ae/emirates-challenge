import type {
  CheckOutcome,
  ParameterValue,
  PresetId,
  RunStatus,
  RunTotals,
  Severity,
  TeamSummary,
} from "@hrcc/shared";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, type Relation } from "typeorm";
import { DatasetEntity } from "./dataset.entity.js";
import { UserEntity } from "./user.entity.js";

/** A live rule version as a run used it: enough to explain and export its findings later. */
export interface RunRuleSnapshot {
  ruleId: string;
  version: number;
  title: string;
  preset: PresetId;
  values: Record<string, ParameterValue>;
  severity: Severity;
  ownerTeam: TeamSummary | null;
  suggestedActionEn: string;
  suggestedActionAr: string;
  counts: Record<CheckOutcome, number>;
  /** Why the check couldn't run on the dataset, when it couldn't. */
  error: string | null;
}

@Entity({ name: "runs" })
export class RunEntity {
  /** "RUN-2026-10-16-01": the Dubai date and that day's number. */
  @PrimaryColumn({ type: "text" })
  id: string;

  @Column({ name: "dataset_id", type: "uuid" })
  datasetId: string;

  @ManyToOne(() => DatasetEntity)
  @JoinColumn({ name: "dataset_id" })
  dataset: Relation<DatasetEntity>;

  @Column({ type: "text" })
  status: RunStatus;

  @Column({ type: "jsonb" })
  rules: RunRuleSnapshot[];

  /** The owner team of each transaction type when the run started. */
  @Column({ type: "jsonb" })
  routing: Record<string, TeamSummary>;

  @Column({ type: "jsonb" })
  totals: RunTotals;

  @Column({ name: "started_by", type: "uuid" })
  startedById: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: "started_by" })
  startedBy: Relation<UserEntity>;

  @Column({ name: "started_at", type: "timestamptz" })
  startedAt: Date;

  @Column({ name: "finished_at", type: "timestamptz" })
  finishedAt: Date;
}
