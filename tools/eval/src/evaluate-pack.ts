import {
  analyzeDataset,
  datasetInputFromAnalysis,
  type PreparedDataset,
  prepareDataset,
  type RuleInput,
  type RuleRun,
  readCsv,
  runChecks,
} from "@hrcc/engine";
import type { Pair } from "./pairs.ts";
import { sampleRules } from "./sample-rules.ts";

export interface PackFiles {
  transactions: Uint8Array;
  employees: Uint8Array;
}

export interface PackResult {
  dataset: PreparedDataset;
  runs: RuleRun[];
  /** One pair per flagged transaction and rule. */
  findings: Pair[];
}

/** A dataset from the two CSV files, read and analysed the way an upload is. */
export function preparePack(files: PackFiles): PreparedDataset {
  const transactions = readCsv(files.transactions);
  const employees = readCsv(files.employees);
  if (!transactions.ok) throw new Error(`transactions.csv: ${transactions.reason}`);
  if (!employees.ok) throw new Error(`employees.csv: ${employees.reason}`);
  const input = { transactions: transactions.table, employees: employees.table };
  const analysis = analyzeDataset(input);
  if (analysis.status === "rejected")
    throw new Error(`The dataset is rejected: ${analysis.rejection}`);
  return prepareDataset(datasetInputFromAnalysis(analysis, input));
}

/** Runs the rules (by default the synthetic policy's) and lists the flagged pairs. */
export function evaluatePack(
  files: PackFiles,
  rules: (dataset: PreparedDataset) => RuleInput[] = sampleRules,
): PackResult {
  const dataset = preparePack(files);
  const runs = runChecks(dataset, rules(dataset));
  const findings = runs.flatMap((run) =>
    run.results
      .filter((result) => result.outcome === "flagged")
      .map((result) => ({
        transactionId: result.transactionId ?? `row ${result.rowNo}`,
        ruleId: run.ruleId,
      })),
  );
  return { dataset, runs, findings };
}
