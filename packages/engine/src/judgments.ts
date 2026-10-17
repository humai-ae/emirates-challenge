import type { JudgmentAnswers, Severity } from "@hrcc/shared";

/** Thresholds on how likely a text breaks its rule; to be calibrated on labelled texts. */
export const JUDGMENT_THRESHOLDS = { unsure: 0.4, breaks: 0.7, high: 0.9, enough: 0.3 } as const;

export type JudgmentDecision = "breaks" | "unsure" | "does_not_break" | "could_not_check";

export interface Judgment {
  decision: JudgmentDecision;
  /** How likely the text breaks the rule: not accepted, or a placeholder if that is likelier. */
  pBreak: number;
  /** How sure AI is, for a text that breaks the rule or may. */
  confidence: Severity | null;
}

/** Jev's four answers as a decision: code applies the thresholds, so they can be tuned and tested. */
export function judge(answers: JudgmentAnswers): Judgment {
  const pBreak = Math.max(1 - answers.accept, answers.placeholder);
  if (answers.enough < JUDGMENT_THRESHOLDS.enough) {
    return { decision: "could_not_check", pBreak, confidence: null };
  }
  if (pBreak >= JUDGMENT_THRESHOLDS.breaks) {
    return {
      decision: "breaks",
      pBreak,
      confidence: pBreak >= JUDGMENT_THRESHOLDS.high ? "High" : "Medium",
    };
  }
  if (pBreak >= JUDGMENT_THRESHOLDS.unsure) {
    return { decision: "unsure", pBreak, confidence: "Low" };
  }
  return { decision: "does_not_break", pBreak, confidence: null };
}

/** The same text however it is spaced, capitalised or written in full-width letters. */
export function normaliseText(text: string): string {
  return text.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

const LIMITS = [1_000, 5_000, 10_000, 50_000, 100_000] as const;
const grouped = (value: number) => value.toLocaleString("en-US");

/** An amount as a range ("10,000 to 50,000"): AI gets its size, not the figure. */
export function amountBand(amount: number | null): string | null {
  if (amount === null || !Number.isFinite(amount) || amount < 0) return null;
  const index = LIMITS.findIndex((limit) => amount < limit);
  if (index === -1) return `over ${grouped(LIMITS[LIMITS.length - 1])}`;
  if (index === 0) return `under ${grouped(LIMITS[0])}`;
  return `${grouped(LIMITS[index - 1] ?? 0)} to ${grouped(LIMITS[index] ?? 0)}`;
}
