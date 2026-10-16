import type {
  Check,
  ClosedFor,
  DraftError,
  DraftMeta,
  DraftMethod,
  NeededField,
  Parameter,
  PresetId,
  RuleStatus,
  Severity,
} from "@hrcc/shared";
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";
import { TeamEntity } from "./team.entity.js";
import { UserEntity } from "./user.entity.js";

/**
 * A check as stored, with its two expressions left untyped: TypeORM's deep partial types can't
 * expand the recursive expression type. Reading a version turns it back into a `Check`.
 */
export type StoredCheck = Omit<Check, "appliesTo" | "logic"> & {
  appliesTo: unknown;
  logic: unknown;
};

/** One version of a rule's check. Versions are never deleted. */
@Entity({ name: "rule_versions" })
export class RuleVersionEntity {
  @PrimaryColumn({ name: "rule_id", type: "text" })
  ruleId: string;

  @PrimaryColumn({ type: "integer" })
  version: number;

  @Column({ type: "text" })
  status: RuleStatus;

  /** The rule as written in the policy, or by the admin. */
  @Column({ name: "source_text", type: "text" })
  sourceText: string;

  /** The policy upload the text came from; null for a rule an admin wrote. */
  @Column({ name: "policy_upload_id", type: "uuid", nullable: true })
  policyUploadId: string | null;

  @Column({ type: "text", nullable: true })
  preset: PresetId | null;

  /** Every parameter of the check type, set or not. */
  @Column({ type: "jsonb" })
  parameters: Parameter[];

  @Column({ name: "check_definition", type: "jsonb", nullable: true })
  check: StoredCheck | null;

  /** Roles the dataset lacks, for a `needs_data` version. */
  @Column({ type: "jsonb" })
  needs: NeededField[];

  @Column({ name: "restatement_en", type: "text", nullable: true })
  restatementEn: string | null;

  @Column({ name: "restatement_ar", type: "text", nullable: true })
  restatementAr: string | null;

  @Column({ type: "text" })
  severity: Severity;

  /** Null: the team for each transaction type. */
  @Column({ name: "owner_team_id", type: "uuid", nullable: true })
  ownerTeamId: string | null;

  @ManyToOne(() => TeamEntity, { nullable: true })
  @JoinColumn({ name: "owner_team_id" })
  ownerTeam: Relation<TeamEntity> | null;

  @Column({ name: "suggested_action_en", type: "text" })
  suggestedActionEn: string;

  @Column({ name: "suggested_action_ar", type: "text" })
  suggestedActionAr: string;

  @Column({ name: "drafted_by", type: "text" })
  draftedBy: DraftMethod;

  @Column({ name: "draft_error", type: "text", nullable: true })
  draftError: DraftError | null;

  /** How a background draft was made: AI's model and certainty, or why it fell back. */
  @Column({ name: "draft_meta", type: "jsonb", nullable: true })
  draftMeta: DraftMeta | null;

  /** The dataset the check was last built against. */
  @Column({ name: "dataset_id", type: "uuid", nullable: true })
  datasetId: string | null;

  @Column({ name: "created_by", type: "uuid" })
  createdById: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: "created_by" })
  createdBy: Relation<UserEntity>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @Column({ name: "approved_by", type: "uuid", nullable: true })
  approvedById: string | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: "approved_by" })
  approvedBy: Relation<UserEntity> | null;

  @Column({ name: "approved_at", type: "timestamptz", nullable: true })
  approvedAt: Date | null;

  @Column({ name: "closed_by", type: "uuid", nullable: true })
  closedById: string | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: "closed_by" })
  closedBy: Relation<UserEntity> | null;

  @Column({ name: "closed_at", type: "timestamptz", nullable: true })
  closedAt: Date | null;

  /** What the admin wrote when rejecting or retiring. */
  @Column({ type: "text", nullable: true })
  reason: string | null;

  /** Set instead of a reason when the system closed the version. */
  @Column({ name: "closed_for", type: "text", nullable: true })
  closedFor: ClosedFor | null;
}
