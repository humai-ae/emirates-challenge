import { describe, expect, it } from "vitest";
import { detectDateFormat, parseDateValue } from "./dates.js";

describe("dates", () => {
  it("resolves day-first and month-first from values above 12", () => {
    expect(detectDateFormat(["03/04/2025", "25/12/2025"])).toMatchObject({
      format: "DD/MM/YYYY",
      ambiguous: false,
    });
    expect(detectDateFormat(["03/04/2025", "12/25/2025"])).toMatchObject({
      format: "MM/DD/YYYY",
      ambiguous: false,
    });
  });

  it("uses day-first, and says so, when no value decides", () => {
    expect(detectDateFormat(["03/04/2025", "05/06/2025"])).toMatchObject({
      format: "DD/MM/YYYY",
      ambiguous: true,
    });
  });

  it("refuses a column that mixes both orders", () => {
    expect(detectDateFormat(["25/01/2025", "01/25/2025"])).toBeNull();
  });

  it("reads ISO dates and datetimes, in Dubai time unless an offset is given", () => {
    expect(parseDateValue("2025-06-01", "YYYY-MM-DD")).toBe("2025-06-01");
    expect(parseDateValue("2025-06-01 08:15", "YYYY-MM-DD HH:mm")).toBe("2025-06-01T04:15:00.000Z");
    expect(parseDateValue("2025-06-01T08:15:00Z", "YYYY-MM-DD HH:mm")).toBe(
      "2025-06-01T08:15:00.000Z",
    );
    expect(detectDateFormat(["2025-06-01 08:15", "2025-06-02 17:40"])).toMatchObject({
      format: "YYYY-MM-DD HH:mm",
      kind: "datetime",
    });
  });

  it("rejects dates that are not on the calendar", () => {
    expect(parseDateValue("2025-02-30", "YYYY-MM-DD")).toBeNull();
    expect(parseDateValue("31/04/2025", "DD/MM/YYYY")).toBeNull();
    expect(parseDateValue("2024-02-29", "YYYY-MM-DD")).toBe("2024-02-29");
  });

  it("needs nine in ten values to parse before calling a column a date", () => {
    expect(detectDateFormat(["2025-06-01", "soon", "later"])).toBeNull();
  });

  it("keeps the order most values show when a few disagree", () => {
    const dayFirst = Array.from(
      { length: 30 },
      (_, index) => `${13 + (index % 16)}/${1 + (index % 12)}/2025`,
    );
    expect(detectDateFormat([...dayFirst, "07/13/2025"])).toMatchObject({
      format: "DD/MM/YYYY",
      ambiguous: false,
      parsed: 30,
    });
  });

  it("ignores a value no order can read when deciding the order", () => {
    const dayFirst = Array.from(
      { length: 10 },
      (_, index) => `${13 + index}/0${1 + (index % 9)}/2025`,
    );
    expect(detectDateFormat([...dayFirst, "31/31/2025"])).toMatchObject({ format: "DD/MM/YYYY" });
  });
});
