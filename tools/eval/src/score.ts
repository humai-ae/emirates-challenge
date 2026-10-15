import type { Pair } from "./pairs.ts";

export interface RuleScore {
  ruleId: string;
  /** Pairs in the answer key. */
  expected: number;
  /** Distinct pairs found. */
  found: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  /** Null when nothing was found for the rule. */
  precision: number | null;
  /** Null when the answer key has nothing for the rule. */
  recall: number | null;
}

export interface Score {
  rules: RuleScore[];
  overall: RuleScore;
  falsePositives: Pair[];
  falseNegatives: Pair[];
  /** Findings that repeated a pair already counted. */
  duplicates: number;
}

export interface Gate {
  minPrecision: number;
  minRecall: number;
}

/** The targets for rules decided by code. */
export const DEFAULT_GATE: Gate = { minPrecision: 0.9, minRecall: 0.95 };

const keyOf = (pair: Pair) => `${pair.transactionId}|${pair.ruleId}`;

function byRuleThenTransaction(a: Pair, b: Pair): number {
  if (a.ruleId !== b.ruleId) return a.ruleId < b.ruleId ? -1 : 1;
  if (a.transactionId !== b.transactionId) return a.transactionId < b.transactionId ? -1 : 1;
  return 0;
}

function tally(
  ruleId: string,
  expected: readonly Pair[],
  found: readonly Pair[],
  key: ReadonlySet<string>,
): RuleScore {
  const truePositives = found.filter((pair) => key.has(keyOf(pair))).length;
  return {
    ruleId,
    expected: expected.length,
    found: found.length,
    truePositives,
    falsePositives: found.length - truePositives,
    falseNegatives: expected.length - truePositives,
    precision: found.length === 0 ? null : truePositives / found.length,
    recall: expected.length === 0 ? null : truePositives / expected.length,
  };
}

/** Precision and recall per rule, matching findings to the answer key by transaction and rule. */
export function scoreFindings(findings: readonly Pair[], answerKey: readonly Pair[]): Score {
  const expected = new Map(answerKey.map((pair) => [keyOf(pair), pair]));
  const found = new Map<string, Pair>();
  let duplicates = 0;
  for (const pair of findings) {
    if (found.has(keyOf(pair))) duplicates += 1;
    else found.set(keyOf(pair), pair);
  }
  const keys = new Set(expected.keys());
  const expectedPairs = [...expected.values()];
  const foundPairs = [...found.values()];
  const ruleIds = [...new Set([...expectedPairs, ...foundPairs].map((pair) => pair.ruleId))].sort();
  return {
    rules: ruleIds.map((ruleId) =>
      tally(
        ruleId,
        expectedPairs.filter((pair) => pair.ruleId === ruleId),
        foundPairs.filter((pair) => pair.ruleId === ruleId),
        keys,
      ),
    ),
    overall: tally("All", expectedPairs, foundPairs, keys),
    falsePositives: foundPairs.filter((pair) => !keys.has(keyOf(pair))).sort(byRuleThenTransaction),
    falseNegatives: expectedPairs
      .filter((pair) => !found.has(keyOf(pair)))
      .sort(byRuleThenTransaction),
    duplicates,
  };
}

export function percent(value: number | null): string {
  return value === null ? "–" : `${(value * 100).toFixed(1)}%`;
}

/** The rules below the targets, and what fell short. */
export function belowGate(score: Score, gate: Gate = DEFAULT_GATE): string[] {
  return score.rules.flatMap((rule) => [
    ...(rule.precision !== null && rule.precision < gate.minPrecision
      ? [`${rule.ruleId} precision ${percent(rule.precision)}`]
      : []),
    ...(rule.recall !== null && rule.recall < gate.minRecall
      ? [`${rule.ruleId} recall ${percent(rule.recall)}`]
      : []),
  ]);
}
