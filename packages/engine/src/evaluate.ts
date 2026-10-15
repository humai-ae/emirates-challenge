import type { Check, CheckOutcome, Evidence, MissingField } from "@hrcc/shared";
import type { PreparedDataset } from "./dataset.js";
import { EvaluationError, evaluate, type Result, Unknown } from "./interpreter.js";
import { PRESETS } from "./presets/index.js";
import type { Params, PresetDefinition } from "./presets/types.js";
import { type CheckIssue, validateCheck } from "./validate.js";

/** One approved rule version to run. */
export interface RuleInput {
  ruleId: string;
  version: number;
  check: Check;
}

/** One rule's outcome on one transaction. */
export interface RowEvaluation {
  outcome: CheckOutcome;
  /** For a flag: the facts behind it. */
  evidence: Evidence[];
  /** For could-not-check: what was missing. */
  missing: MissingField[];
  /** For could-not-check: the mistake the check made on this row, when that was the reason. */
  error: string | null;
}

/** A result worth keeping: a flag, a transaction that could not be checked, or one for AI. */
export interface RowResult extends RowEvaluation {
  rowNo: number;
  transactionId: string | null;
}

export interface RuleRun {
  ruleId: string;
  version: number;
  /** Every transaction counts once. */
  counts: Record<CheckOutcome, number>;
  /** Flagged, could-not-check and needs-judgment transactions, in file order. */
  results: RowResult[];
}

/** A check that can't run: it is malformed or uses fields this dataset lacks. */
export class InvalidCheckError extends Error {
  constructor(readonly issues: readonly CheckIssue[]) {
    super(
      `The check can't run: ${issues.map((issue) => `${issue.code} ${issue.detail}`).join("; ")}`,
    );
  }
}

/** A check validated for a dataset, with its preset and parameter values. */
export interface PreparedCheck {
  check: Check;
  preset: PresetDefinition;
  params: Params;
}

export function prepareCheck(check: unknown, dataset: PreparedDataset): PreparedCheck {
  const validation = validateCheck(check, dataset);
  if (!validation.ok) throw new InvalidCheckError(validation.issues);
  const preset = PRESETS.get(validation.check.preset);
  if (!preset) {
    throw new InvalidCheckError([
      { code: "invalid_shape", at: "preset", detail: `${validation.check.preset} can't run yet` },
    ]);
  }
  return {
    check: validation.check,
    preset,
    params: new Map(
      validation.check.parameters.map((parameter) => [parameter.name, parameter.value]),
    ),
  };
}

function decide(value: Result, part: string): boolean | Unknown {
  if (value instanceof Unknown || typeof value === "boolean") return value;
  throw new EvaluationError(`${part} must give true or false`);
}

function only(
  outcome: CheckOutcome,
  missing: readonly MissingField[] = [],
  error: string | null = null,
): RowEvaluation {
  return { outcome, evidence: [], missing: [...missing], error };
}

/** One rule on one transaction. A problem on this row never affects other rows or rules. */
export function evaluateRow(
  dataset: PreparedDataset,
  prepared: PreparedCheck,
  rowIndex: number,
): RowEvaluation {
  const { check, preset, params } = prepared;
  const scope = { dataset, rowIndex, params };
  try {
    const applies = decide(evaluate(check.appliesTo, scope), "appliesTo");
    if (applies instanceof Unknown) return only("could_not_check", applies.missing);
    if (!applies) return only("not_applicable");
    const breaks = decide(evaluate(check.logic, scope), "logic");
    if (breaks instanceof Unknown) return only("could_not_check", breaks.missing);
    if (breaks) {
      return { outcome: "flagged", evidence: preset.evidence(scope), missing: [], error: null };
    }
    return only(check.checkKind === "judgment" ? "needs_judgment" : "passed");
  } catch (error) {
    return only("could_not_check", [], error instanceof Error ? error.message : String(error));
  }
}

const KEPT: ReadonlySet<CheckOutcome> = new Set(["flagged", "could_not_check", "needs_judgment"]);

/** Every rule on every transaction: rules in the order given, transactions in file order. */
export function runChecks(dataset: PreparedDataset, rules: readonly RuleInput[]): RuleRun[] {
  // Every check is validated before any row is read.
  const prepared = rules.map((rule) => ({ rule, check: prepareCheck(rule.check, dataset) }));
  return prepared.map(({ rule, check }) => {
    const counts: Record<CheckOutcome, number> = {
      not_applicable: 0,
      passed: 0,
      flagged: 0,
      could_not_check: 0,
      needs_judgment: 0,
    };
    const results: RowResult[] = [];
    for (const row of dataset.rows) {
      const evaluation = evaluateRow(dataset, check, row.index);
      counts[evaluation.outcome] += 1;
      if (KEPT.has(evaluation.outcome)) {
        results.push({ rowNo: row.rowNo, transactionId: row.transactionId, ...evaluation });
      }
    }
    return { ruleId: rule.ruleId, version: rule.version, counts, results };
  });
}
