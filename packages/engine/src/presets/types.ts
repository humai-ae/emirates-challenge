import type {
  CheckKind,
  Evidence,
  Expression,
  NeededField,
  ParameterSpec,
  ParameterValue,
  PresetId,
} from "@hrcc/shared";
import type { PreparedDataset } from "../dataset.js";

export type { NeededField, ParameterSpec } from "@hrcc/shared";

export type Params = ReadonlyMap<string, ParameterValue>;

export type BuildResult =
  | { ok: true; appliesTo: Expression; logic: Expression }
  | { ok: false; needs: NeededField[] };

/** The transaction a preset is describing. */
export interface RowContext {
  dataset: PreparedDataset;
  rowIndex: number;
  params: Params;
}

/** A passed transaction that only just passed, and the facts that show it. */
export interface NearMiss {
  reason: string;
  facts: Evidence[];
}

/**
 * A type of check: its parameters, how it writes the check's expressions from their values and
 * the dataset's columns, and how it describes a flag or a near miss.
 */
export interface PresetDefinition {
  id: PresetId;
  checkKind: CheckKind;
  parameters: readonly ParameterSpec[];
  build(params: Params, dataset: PreparedDataset): BuildResult;
  /** The facts behind a flag on this transaction. */
  evidence(row: RowContext): Evidence[];
  /** Why a passed transaction only just passed, when it did. */
  nearMiss?(row: RowContext): NearMiss | null;
}
