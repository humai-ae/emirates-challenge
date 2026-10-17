import type { QueryDeepPartialEntity } from "typeorm";
import type { RuleVersionEntity } from "../database/entities/index.js";
import type { DraftFields } from "./drafting.js";

/** A version as inserted: every column, no relations. */
export type NewVersion = Omit<
  RuleVersionEntity,
  "createdBy" | "approvedBy" | "closedBy" | "ownerTeam" | "createdAt"
>;

/** TypeORM's write types map the check's untyped expressions to `{}`; these rows are complete. */
export function versionRow(values: Partial<NewVersion>): QueryDeepPartialEntity<RuleVersionEntity> {
  return values as QueryDeepPartialEntity<RuleVersionEntity>;
}

/** What a version starts from: its rule and number, its text, and who it was made for. */
export interface VersionBase {
  ruleId: string;
  version: number;
  text: string;
  policyUploadId: string | null;
  createdById: string;
}

export type VersionSettings = Pick<
  NewVersion,
  "severity" | "ownerTeamId" | "suggestedActionEn" | "suggestedActionAr" | "draftedBy" | "draftMeta"
>;

/** Every column of an open version: what it is, its drafted fields and its settings. */
export function versionOf(
  base: VersionBase,
  datasetId: string | null,
  fields: DraftFields,
  settings: VersionSettings,
): NewVersion {
  return {
    ruleId: base.ruleId,
    version: base.version,
    sourceText: base.text,
    policyUploadId: base.policyUploadId,
    ...fields,
    ...settings,
    datasetId,
    createdById: base.createdById,
    approvedById: null,
    approvedAt: null,
    closedById: null,
    closedAt: null,
    reason: null,
    closedFor: null,
    // A fresh draft starts without criteria: the admin writes them for the rule's text.
    judgmentCriteria: null,
  };
}
