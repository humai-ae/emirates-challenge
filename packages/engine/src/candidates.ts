/** Values a rule's text mentions, which drafting picks parameter values from. */
export interface Candidates {
  /** Money amounts, with their currency when written. */
  amounts: Array<{ value: number; currency: string | null }>;
  /** "Grade 10". */
  grades: number[];
  /** "30 days", "12-month", "5 working days", as days. */
  durations: Array<{ days: number; working: boolean }>;
  /** "at most 2", "no more than two". */
  counts: number[];
  percentages: number[];
  /** The dataset's transaction types the text names. */
  types: string[];
  /** The dataset's document names the text names. */
  documents: string[];
  /** The first documents the text joins with "or": any one of them will do. */
  documentAlternatives: string[];
  /** Types the text names after "except", "other than" or "apart from". */
  exceptTypes: string[];
}

export interface CandidateVocabulary {
  types: readonly string[];
  documents: readonly string[];
}

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};
const COUNTABLE = `(\\d{1,4}|${Object.keys(NUMBER_WORDS).join("|")})`;
const AMOUNT = "(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)";
const CURRENCY = "(AED|USD|EUR|GBP|SAR|QAR|Dhs?|dirhams?)";
const UNIT = "(?:working\\s+|business\\s+|calendar\\s+)?(?:day|week|month|year)s?\\b";

function countable(text: string): number {
  return NUMBER_WORDS[text.toLowerCase()] ?? Number(text);
}

function currencyCode(text: string): string {
  return /^(dhs?|dirhams?)$/i.test(text) ? "AED" : text.toUpperCase();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function days(count: number, unit: string): number {
  if (unit === "week") return count * 7;
  // "12 months" is a year; other months are a share of one.
  if (unit === "month") return count === 12 ? 365 : Math.round((count * 365) / 12);
  if (unit === "year") return count * 365;
  return count;
}

/** Vocabulary values the text names as words ("allowance_change" ↔ "allowance changes"). */
function named(text: string, values: readonly string[]): string[] {
  const found: Array<{ value: string; at: number }> = [];
  for (const value of values) {
    const words = value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map(escapeRegExp);
    if (words.length === 0) continue;
    const match = new RegExp(`\\b${words.join("[\\s_-]+")}(?:s|es)?\\b`, "i").exec(text);
    if (match) found.push({ value, at: match.index });
  }
  return found.sort((a, b) => a.at - b.at).map((item) => item.value);
}

/** "except for LEAVE", "other than EXIT": what follows, to the end of its sentence or line. */
const EXCEPTION =
  /\b(?:except(?:\s+for)?|other than|apart from|excluding|with the exception of|but not)\b([^.;\n]*)/gi;

/** The types the text names as exceptions. */
function exceptionsIn(text: string, types: readonly string[]): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(EXCEPTION)) {
    for (const type of named(match[1] ?? "", types)) found.add(type);
  }
  return [...found];
}

/** Every place the text names a vocabulary value, in the order they appear. */
function mentions(text: string, values: readonly string[]) {
  const found: Array<{ value: string; at: number; end: number }> = [];
  for (const value of values) {
    const words = value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map(escapeRegExp);
    if (words.length === 0) continue;
    const pattern = new RegExp(`\\b${words.join("[\\s_-]+")}(?:s|es)?\\b`, "gi");
    for (const match of text.matchAll(pattern)) {
      found.push({ value, at: match.index, end: match.index + match[0].length });
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

/** Between two names in a list: a comma or "or", with "a", "an" or "the". */
const LIST_GAP = /^\s*(?:,\s*)?(?:(or|either)\s+)?(?:an?\s+|the\s+)?$/i;

/** The first run of documents joined with "or" ("a resignation letter or a termination letter"). */
function alternativesIn(text: string, documents: readonly string[]): string[] {
  const found = mentions(text, documents);
  let run: string[] = [];
  let joinedByOr = false;
  for (let index = 0; index < found.length; index += 1) {
    const current = found[index];
    if (!current) break;
    if (run.length === 0) run = [current.value];
    const next = found[index + 1];
    const gap = next ? LIST_GAP.exec(text.slice(current.end, next.at)) : null;
    if (next && gap) {
      if (!run.includes(next.value)) run.push(next.value);
      if (gap[1]) joinedByOr = true;
      continue;
    }
    if (joinedByOr && run.length > 1) return run;
    run = [];
    joinedByOr = false;
  }
  return [];
}

export function extractCandidates(text: string, vocabulary: CandidateVocabulary): Candidates {
  const amounts: Array<{ value: number; currency: string | null; at: number }> = [];
  for (const match of text.matchAll(new RegExp(`\\b${CURRENCY}\\s?${AMOUNT}`, "gi"))) {
    amounts.push({
      value: Number((match[2] ?? "").replaceAll(",", "")),
      currency: currencyCode(match[1] ?? ""),
      at: match.index,
    });
  }
  for (const match of text.matchAll(new RegExp(`${AMOUNT}\\s?${CURRENCY}\\b`, "gi"))) {
    amounts.push({
      value: Number((match[1] ?? "").replaceAll(",", "")),
      currency: currencyCode(match[2] ?? ""),
      at: match.index,
    });
  }
  if (amounts.length === 0) {
    // Without a currency, a number written with thousands separators reads as an amount.
    for (const match of text.matchAll(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g)) {
      amounts.push({
        value: Number(match[0].replaceAll(",", "")),
        currency: null,
        at: match.index,
      });
    }
  }
  const durationPattern = new RegExp(
    `\\b${COUNTABLE}[\\s-]+(working\\s+|business\\s+|calendar\\s+)?(day|week|month|year)s?\\b`,
    "gi",
  );
  // A number followed by a unit of time is a duration, not a count ("more than 30 days").
  const countPattern = new RegExp(
    `\\b(?:at most|no more than|not more than|a maximum of|maximum of|up to|more than)\\s+${COUNTABLE}\\b(?![\\s-]+${UNIT})`,
    "gi",
  );
  return {
    amounts: amounts
      .sort((a, b) => a.at - b.at)
      .map(({ value, currency }) => ({ value, currency })),
    grades: [...text.matchAll(/\bgrade\s*(\d{1,2})\b/gi)].map((match) => Number(match[1])),
    durations: [...text.matchAll(durationPattern)].map((match) => ({
      days: days(countable(match[1] ?? ""), (match[3] ?? "").toLowerCase()),
      working: /working|business/i.test(match[2] ?? ""),
    })),
    counts: [...text.matchAll(countPattern)].map((match) => countable(match[1] ?? "")),
    percentages: [...text.matchAll(/(\d{1,3}(?:\.\d+)?)\s?%/g)].map((match) => Number(match[1])),
    types: named(text, vocabulary.types),
    documents: named(text, vocabulary.documents),
    documentAlternatives: alternativesIn(text, vocabulary.documents),
    exceptTypes: exceptionsIn(text, vocabulary.types),
  };
}
