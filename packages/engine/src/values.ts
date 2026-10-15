import type { ColumnType } from "@hrcc/shared";
import { type DateFormat, DUBAI_OFFSET_MINUTES, parseDateValue } from "./dates.js";
import { parseNumber } from "./profile.js";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const DUBAI_OFFSET_MS = DUBAI_OFFSET_MINUTES * MINUTE_MS;

/** A date, with or without a time, on the Dubai calendar. */
export class DateValue {
  constructor(
    /** Days since 1970-01-01. */
    readonly day: number,
    /** Minutes after midnight; null when the value has no time. */
    readonly minute: number | null,
  ) {}
}

/** A `YYYY-MM-DD` date as a day number. */
export function dayNumber(isoDate: string): number {
  return Math.round(Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS);
}

/** What `parseDateValue` returns (`YYYY-MM-DD`, or a UTC ISO timestamp) on the Dubai calendar. */
export function toDateValue(parsed: string): DateValue {
  if (parsed.length === 10) return new DateValue(dayNumber(parsed), null);
  const local = Date.parse(parsed) + DUBAI_OFFSET_MS;
  const day = Math.floor(local / DAY_MS);
  return new DateValue(day, Math.floor((local - day * DAY_MS) / MINUTE_MS));
}

/** ISO weekday: 1 is Monday, 7 is Sunday. */
export function weekdayOf(day: number): number {
  // Day 0, 1970-01-01, was a Thursday.
  return ((((day + 3) % 7) + 7) % 7) + 1;
}

export interface WorkCalendar {
  /** ISO weekdays that are working days. */
  workingWeekdays: ReadonlySet<number>;
  /** Public holidays, as day numbers. */
  holidays: ReadonlySet<number>;
}

/** Monday to Friday, the UAE working week. Public holidays come from settings. */
export const DEFAULT_CALENDAR: WorkCalendar = {
  workingWeekdays: new Set([1, 2, 3, 4, 5]),
  holidays: new Set(),
};

/** Working days after `from`, up to and including `to`; negative when `to` comes first. */
export function workingDaysBetween(from: number, to: number, calendar: WorkCalendar): number {
  const [start, end, sign] = to >= from ? [from, to, 1] : [to, from, -1];
  let count = 0;
  for (let day = start + 1; day <= end; day += 1) {
    if (calendar.workingWeekdays.has(weekdayOf(day)) && !calendar.holidays.has(day)) count += 1;
  }
  return sign * count;
}

/** How a column writes its values. */
export interface CellFormat {
  type: ColumnType;
  dateFormat: DateFormat | null;
  listDelimiter: ";" | "|" | null;
}

export type CellValue = string | number | boolean | DateValue | readonly string[];

export type CellRead = { ok: true; value: CellValue } | { ok: false; reason: "blank" | "invalid" };

/** List items, split on the column's delimiter or, without one, on `;` and `|`. */
export function splitList(text: string, delimiter: ";" | "|" | null = null): string[] {
  return text
    .split(delimiter ?? /[;|]/)
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/** One cell read as its column's type. Blank and unreadable cells are reported, never guessed. */
export function readCell(raw: string | undefined, format: CellFormat): CellRead {
  const text = (raw ?? "").trim();
  if (text === "") return { ok: false, reason: "blank" };
  switch (format.type) {
    case "integer":
    case "number": {
      const value = parseNumber(text);
      return value === null ? { ok: false, reason: "invalid" } : { ok: true, value };
    }
    case "date":
    case "datetime": {
      const parsed = format.dateFormat ? parseDateValue(text, format.dateFormat) : null;
      return parsed === null
        ? { ok: false, reason: "invalid" }
        : { ok: true, value: toDateValue(parsed) };
    }
    case "list":
      return { ok: true, value: splitList(text, format.listDelimiter) };
    case "boolean": {
      const lower = text.toLowerCase();
      if (lower === "true" || lower === "yes") return { ok: true, value: true };
      if (lower === "false" || lower === "no") return { ok: true, value: false };
      return { ok: false, reason: "invalid" };
    }
    default:
      return { ok: true, value: text };
  }
}
