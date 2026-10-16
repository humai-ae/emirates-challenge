import {
  type Check,
  type Parameter,
  type ParameterIssue,
  type ParameterProblem,
  ParameterSchema,
  type ParameterValue,
  type PresetId,
} from "@hrcc/shared";
import type { PreparedDataset } from "../dataset.js";
import { inspectExpressions, validateCheck } from "../validate.js";
import { approverMinGrade, requesterNotApprover, subjectNotApprover } from "./approvals.js";
import { documentsPresent } from "./documents.js";
import { fieldCompare, requiredField } from "./fields.js";
import { maxCountInWindow } from "./history.js";
import { textJudgment } from "./judgment.js";
import { approvalsInOrder, approvedByEffective, submittedWithinAfterEffective } from "./timing.js";
import type { NeededField, PresetDefinition } from "./types.js";

/** Every preset the engine can run, by ID. */
export const PRESETS: ReadonlyMap<PresetId, PresetDefinition> = new Map(
  [
    fieldCompare,
    requiredField,
    approverMinGrade,
    requesterNotApprover,
    subjectNotApprover,
    documentsPresent,
    approvedByEffective,
    submittedWithinAfterEffective,
    approvalsInOrder,
    maxCountInWindow,
    textJudgment,
  ].map((preset) => [preset.id, preset] as const),
);

export type { ParameterIssue, ParameterProblem } from "@hrcc/shared";

export type BuildCheckResult =
  | { ok: true; check: Check }
  | { ok: false; reason: "unknown_preset" }
  | { ok: false; reason: "parameters"; issues: ParameterIssue[] }
  | { ok: false; reason: "needs_data"; needs: NeededField[] };

function parameterIssues(
  preset: PresetDefinition,
  parameters: readonly Parameter[],
  dataset: PreparedDataset,
): ParameterIssue[] {
  const issues: ParameterIssue[] = [];
  const seen = new Set<string>();
  for (const parameter of parameters) {
    const report = (problem: ParameterProblem) => {
      issues.push({ parameter: parameter.name, problem });
    };
    if (seen.has(parameter.name)) {
      report("repeated");
      continue;
    }
    seen.add(parameter.name);
    const spec = preset.parameters.find((item) => item.name === parameter.name);
    if (!spec) {
      report("unknown");
      continue;
    }
    if (parameter.type !== spec.type || !ParameterSchema.safeParse(parameter).success) {
      report("wrong_type");
      continue;
    }
    const { value } = parameter;
    if (value === null) {
      if (!spec.optional) report("missing");
      continue;
    }
    if (spec.choices && !(typeof value === "string" && spec.choices.includes(value))) {
      report("not_a_choice");
    }
    if (spec.min !== undefined && typeof value === "number" && value < spec.min) {
      report("too_small");
    }
    if (spec.type === "column" && typeof value === "string") {
      const column = dataset.column("transactions", value);
      if (!column) report("unknown_column");
      else if (spec.columnTypes && !spec.columnTypes.includes(column.type)) report("column_type");
    }
  }
  for (const spec of preset.parameters) {
    if (!spec.optional && !seen.has(spec.name)) {
      issues.push({ parameter: spec.name, problem: "missing" });
    }
  }
  return issues;
}

/** Plain values typed by the preset's parameters; unknown names are kept for `buildCheck` to report. */
export function presetParameters(
  presetId: PresetId,
  values: Readonly<Record<string, ParameterValue>>,
): Parameter[] {
  const specs = PRESETS.get(presetId)?.parameters ?? [];
  return Object.entries(values).map(([name, value]) => ({
    name,
    type: specs.find((spec) => spec.name === name)?.type ?? "string",
    value,
    editedByAdmin: false,
  }));
}

/**
 * A complete check from a preset, its parameter values and a dataset's columns. Code writes the
 * expressions; an optional parameter left out is kept as unset.
 */
export function buildCheck(
  presetId: PresetId,
  parameters: readonly Parameter[],
  dataset: PreparedDataset,
): BuildCheckResult {
  const preset = PRESETS.get(presetId);
  if (!preset) return { ok: false, reason: "unknown_preset" };
  const issues = parameterIssues(preset, parameters, dataset);
  if (issues.length > 0) return { ok: false, reason: "parameters", issues };
  const complete = preset.parameters.map(
    (spec): Parameter =>
      parameters.find((parameter) => parameter.name === spec.name) ?? {
        name: spec.name,
        type: spec.type,
        value: null,
        editedByAdmin: false,
      },
  );
  const params = new Map(complete.map((parameter) => [parameter.name, parameter.value]));
  const result = preset.build(params, dataset);
  if (!result.ok) return { ok: false, reason: "needs_data", needs: result.needs };
  const { fields } = inspectExpressions(
    result.appliesTo,
    result.logic,
    new Set(params.keys()),
    dataset,
  );
  const validation = validateCheck(
    {
      checkKind: preset.checkKind,
      preset: preset.id,
      appliesTo: result.appliesTo,
      logic: result.logic,
      fieldsUsed: fields,
      parameters: complete,
    },
    dataset,
  );
  if (!validation.ok) {
    const problems = validation.issues.map((issue) => `${issue.code} ${issue.detail}`).join("; ");
    throw new Error(`The ${preset.id} preset built a check that doesn't validate: ${problems}`);
  }
  return { ok: true, check: validation.check };
}
