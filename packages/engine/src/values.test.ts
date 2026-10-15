import { describe, expect, it } from "vitest";
import {
  type CellFormat,
  DateValue,
  DEFAULT_CALENDAR,
  dayNumber,
  readCell,
  splitList,
  toDateValue,
  weekdayOf,
  workingDaysBetween,
} from "./values.js";

const format = (type: CellFormat["type"], extra: Partial<CellFormat> = {}): CellFormat => ({
  type,
  dateFormat: null,
  listDelimiter: null,
  ...extra,
});
const date = format("date", { dateFormat: "YYYY-MM-DD" });
const datetime = format("datetime", { dateFormat: "YYYY-MM-DD HH:mm" });

describe("dates for checks", () => {
  it("counts days on the Dubai calendar", () => {
    expect(dayNumber("2025-02-27") - dayNumber("2025-02-20")).toBe(7);
    expect(toDateValue("2025-02-20")).toEqual(new DateValue(dayNumber("2025-02-20"), null));
  });

  it("reads times in Dubai, where the day can differ from UTC", () => {
    // 07:00 UTC is 11:00 in Dubai; 21:30 UTC is 01:30 the next morning.
    expect(toDateValue("2025-02-27T07:00:00.000Z")).toEqual(
      new DateValue(dayNumber("2025-02-27"), 660),
    );
    expect(toDateValue("2025-02-27T21:30:00.000Z")).toEqual(
      new DateValue(dayNumber("2025-02-28"), 90),
    );
  });

  it("knows the weekday", () => {
    expect(weekdayOf(dayNumber("2025-10-13"))).toBe(1);
    expect(weekdayOf(dayNumber("2025-10-19"))).toBe(7);
    expect(weekdayOf(dayNumber("1969-12-29"))).toBe(1);
  });

  it("counts working days, skipping weekends and holidays", () => {
    const friday = dayNumber("2025-10-17");
    const monday = dayNumber("2025-10-20");
    expect(workingDaysBetween(friday, monday, DEFAULT_CALENDAR)).toBe(1);
    expect(workingDaysBetween(monday, friday, DEFAULT_CALENDAR)).toBe(-1);
    expect(workingDaysBetween(friday, friday, DEFAULT_CALENDAR)).toBe(0);
    const holiday = { ...DEFAULT_CALENDAR, holidays: new Set([monday]) };
    expect(workingDaysBetween(friday, monday, holiday)).toBe(0);
  });
});

describe("readCell", () => {
  it("reports blank and unreadable cells", () => {
    expect(readCell("  ", date)).toEqual({ ok: false, reason: "blank" });
    expect(readCell(undefined, date)).toEqual({ ok: false, reason: "blank" });
    expect(readCell("31/02/2025", date)).toEqual({ ok: false, reason: "invalid" });
    expect(readCell("AED 5k", format("number"))).toEqual({ ok: false, reason: "invalid" });
    expect(readCell("maybe", format("boolean"))).toEqual({ ok: false, reason: "invalid" });
  });

  it("reads numbers, dates, lists, booleans and text", () => {
    expect(readCell("16,200", format("number"))).toEqual({ ok: true, value: 16200 });
    expect(readCell("2025-02-20", date)).toEqual({
      ok: true,
      value: new DateValue(dayNumber("2025-02-20"), null),
    });
    expect(readCell("2025-02-27 11:00", datetime)).toEqual({
      ok: true,
      value: new DateValue(dayNumber("2025-02-27"), 660),
    });
    expect(readCell("a; b ;", format("list", { listDelimiter: ";" }))).toEqual({
      ok: true,
      value: ["a", "b"],
    });
    expect(readCell("Yes", format("boolean"))).toEqual({ ok: true, value: true });
    expect(readCell(" E-0007 ", format("id"))).toEqual({ ok: true, value: "E-0007" });
  });

  it("splits lists on ; or | when the column has no delimiter", () => {
    expect(splitList("resignation_letter;clearance_form")).toEqual([
      "resignation_letter",
      "clearance_form",
    ]);
    expect(splitList("a | b")).toEqual(["a", "b"]);
    expect(splitList("a|b", ";")).toEqual(["a|b"]);
  });
});
