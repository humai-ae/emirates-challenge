/** How a column writes its dates. Times without an offset are Asia/Dubai (UTC+4, no daylight saving). */
export type DateFormat =
  | "YYYY-MM-DD"
  | "DD/MM/YYYY"
  | "MM/DD/YYYY"
  | "YYYY-MM-DD HH:mm"
  | "DD/MM/YYYY HH:mm"
  | "MM/DD/YYYY HH:mm";

export interface DetectedDateFormat {
  format: DateFormat;
  kind: "date" | "datetime";
  /** True when no value decided day-first against month-first, so day-first was used. */
  ambiguous: boolean;
  /** How many values parse in this format. */
  parsed: number;
}

export const DUBAI_OFFSET_MINUTES = 240;

const ISO_DATE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
const ISO_DATETIME =
  /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;
const NUMERIC_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const NUMERIC_DATETIME = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/;

function isCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function utcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  offsetMinutes: number,
): string | null {
  if (!isCalendarDate(year, month, day) || hour > 23 || minute > 59 || second > 59) return null;
  const ms = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
  return new Date(ms).toISOString();
}

function offsetOf(zone: string | undefined): number {
  if (!zone) return DUBAI_OFFSET_MINUTES;
  if (zone === "Z") return 0;
  const sign = zone.startsWith("-") ? -1 : 1;
  const digits = zone.slice(1).replace(":", "");
  return sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
}

/** A value written in `format`, as `YYYY-MM-DD` or a UTC ISO timestamp; null when invalid. */
export function parseDateValue(value: string, format: DateFormat): string | null {
  const text = value.trim();
  switch (format) {
    case "YYYY-MM-DD": {
      const match = ISO_DATE.exec(text);
      if (!match) return null;
      const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
      return isCalendarDate(year, month, day) ? isoDate(year, month, day) : null;
    }
    case "DD/MM/YYYY":
    case "MM/DD/YYYY": {
      const match = NUMERIC_DATE.exec(text);
      if (!match) return null;
      const [first, second, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
      const [day, month] = format === "DD/MM/YYYY" ? [first, second] : [second, first];
      return isCalendarDate(year, month, day) ? isoDate(year, month, day) : null;
    }
    case "YYYY-MM-DD HH:mm": {
      const match = ISO_DATETIME.exec(text);
      if (!match) return null;
      return utcIso(
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6] ?? 0),
        offsetOf(match[7]),
      );
    }
    case "DD/MM/YYYY HH:mm":
    case "MM/DD/YYYY HH:mm": {
      const match = NUMERIC_DATETIME.exec(text);
      if (!match) return null;
      const [first, second] = [Number(match[1]), Number(match[2])];
      const [day, month] = format === "DD/MM/YYYY HH:mm" ? [first, second] : [second, first];
      return utcIso(
        Number(match[3]),
        month,
        day,
        Number(match[4]),
        Number(match[5]),
        Number(match[6] ?? 0),
        DUBAI_OFFSET_MINUTES,
      );
    }
  }
}

type SlashOrder = "day-first" | "month-first" | "unknown" | "mixed";

/**
 * Day/month order from the values only one order can read (a first part above 12 is a day, a
 * second part above 12 is a day). A few values in the other order are mistakes, left to fail as
 * invalid; a real split is "mixed". Values above 12 in both parts decide nothing.
 */
function slashOrder(values: readonly string[], pattern: RegExp): SlashOrder {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const value of values) {
    const match = pattern.exec(value.trim());
    if (!match) continue;
    const [first, second] = [Number(match[1]), Number(match[2])];
    if (first > 12 && second <= 12) dayFirst += 1;
    else if (second > 12 && first <= 12) monthFirst += 1;
  }
  const deciding = dayFirst + monthFirst;
  if (deciding === 0) return "unknown";
  if (dayFirst >= deciding * 0.9) return "day-first";
  if (monthFirst >= deciding * 0.9) return "month-first";
  return "mixed";
}

/** Mostly numeric dates whose values disagree on day/month order, so they can't be read safely. */
export function hasMixedDateOrder(values: readonly string[]): boolean {
  if (values.length === 0) return false;
  return [NUMERIC_DATE, NUMERIC_DATETIME].some((pattern) => {
    const matching = values.filter((value) => pattern.test(value.trim())).length;
    return matching >= values.length * 0.9 && slashOrder(values, pattern) === "mixed";
  });
}

/** The format most values follow, when at least nine in ten of them parse in it. */
export function detectDateFormat(values: readonly string[]): DetectedDateFormat | null {
  if (values.length === 0) return null;
  const parsedIn = (format: DateFormat) =>
    values.filter((value) => parseDateValue(value, format) !== null).length;
  const candidates: DetectedDateFormat[] = [
    { format: "YYYY-MM-DD", kind: "date", ambiguous: false, parsed: parsedIn("YYYY-MM-DD") },
    {
      format: "YYYY-MM-DD HH:mm",
      kind: "datetime",
      ambiguous: false,
      parsed: parsedIn("YYYY-MM-DD HH:mm"),
    },
  ];
  const numeric = [
    { pattern: NUMERIC_DATE, kind: "date", dayFirst: "DD/MM/YYYY", monthFirst: "MM/DD/YYYY" },
    {
      pattern: NUMERIC_DATETIME,
      kind: "datetime",
      dayFirst: "DD/MM/YYYY HH:mm",
      monthFirst: "MM/DD/YYYY HH:mm",
    },
  ] as const;
  for (const family of numeric) {
    const order = slashOrder(values, family.pattern);
    if (order === "mixed") continue;
    const format = order === "month-first" ? family.monthFirst : family.dayFirst;
    candidates.push({
      format,
      kind: family.kind,
      ambiguous: order === "unknown",
      parsed: parsedIn(format),
    });
  }
  const best = candidates.reduce((winner, candidate) =>
    candidate.parsed > winner.parsed ? candidate : winner,
  );
  return best.parsed > 0 && best.parsed >= values.length * 0.9 ? best : null;
}
