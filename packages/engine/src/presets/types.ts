import type {
  CheckKind,
  ColumnType,
  DatasetFileKind,
  Evidence,
  Expression,
  ParameterType,
  ParameterValue,
  PresetId,
} from "@hrcc/shared";
import type { PreparedDataset } from "../dataset.js";

/** One parameter a preset takes. */
export interface ParameterSpec {
  name: string;
  type: ParameterType;
  /** May be left unset (null), which leaves its condition out of the check. */
  optional?: boolean;
  /** Allowed values of a `string` parameter. */
  choices?: readonly string[];
  /** Smallest allowed number. */
  min?: number;
  /** For a `column` parameter, the column types it accepts. */
  columnTypes?: readonly ColumnType[];
}

export type Params = ReadonlyMap<string, ParameterValue>;

/** A role no column plays in the dataset, which the check needs. */
export interface NeededField {
  file: DatasetFileKind;
  role: string;
}

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
