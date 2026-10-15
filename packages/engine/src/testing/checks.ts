import type { Check, Parameter, PresetId } from "@hrcc/shared";
import type { PreparedDataset } from "../dataset.js";
import { evaluateRow, prepareCheck, type RowEvaluation } from "../evaluate.js";
import { buildCheck, PRESETS } from "../presets/index.js";
import type { NearMiss } from "../presets/types.js";

export function param(name: string, type: Parameter["type"], value: Parameter["value"]): Parameter {
  return { name, type, value, editedByAdmin: false };
}

/** A check built from a preset; the test fails if it can't be built. */
export function check(
  data: PreparedDataset,
  preset: PresetId,
  parameters: readonly Parameter[],
): Check {
  const result = buildCheck(preset, parameters, data);
  if (!result.ok) throw new Error(`Can't build ${preset}: ${JSON.stringify(result)}`);
  return result.check;
}

/** The check's outcome on every transaction, in file order. */
export function evaluations(data: PreparedDataset, built: Check): RowEvaluation[] {
  const prepared = prepareCheck(built, data);
  return data.rows.map((row) => evaluateRow(data, prepared, row.index));
}

/** What the preset says about a passed transaction that only just passed. */
export function nearMiss(data: PreparedDataset, built: Check, rowIndex: number): NearMiss | null {
  const params = new Map(built.parameters.map((parameter) => [parameter.name, parameter.value]));
  return PRESETS.get(built.preset)?.nearMiss?.({ dataset: data, rowIndex, params }) ?? null;
}
