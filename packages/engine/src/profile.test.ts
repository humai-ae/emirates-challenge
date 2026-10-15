import { describe, expect, it } from "vitest";
import { profileColumn } from "./profile.js";

describe("profileColumn", () => {
  it("recognises IDs by name or by code-like values", () => {
    expect(profileColumn("employee_id", 0, ["1182", "1183", "1182"]).type).toBe("id");
    expect(profileColumn("ref", 0, ["TX-000001", "TX-000002", "TX-000003"]).type).toBe("id");
  });

  it("reads integers, decimals and thousands separators", () => {
    expect(profileColumn("amount", 0, ["1,200", "14200", "", "99.5"])).toMatchObject({
      type: "number",
      min: 99.5,
      max: 14200,
      blankCount: 1,
      invalidCount: 0,
    });
    expect(profileColumn("grade", 0, ["7", "10", "7"]).type).toBe("integer");
  });

  it("counts values that don't parse in a mostly numeric column", () => {
    const values = [...Array.from({ length: 19 }, (_, index) => String(index + 1)), "n/a"];
    expect(profileColumn("amount", 0, values)).toMatchObject({
      type: "integer",
      invalidCount: 1,
      invalidExamples: ["n/a"],
    });
  });

  it("detects dates and keeps the earliest and the latest", () => {
    expect(profileColumn("effective_date", 0, ["2025-06-01", "2025-01-15", ""])).toMatchObject({
      type: "date",
      dateFormat: "YYYY-MM-DD",
      min: "2025-01-15",
      max: "2025-06-01",
    });
  });

  it("detects lists, categories, booleans and free text", () => {
    expect(
      profileColumn("documents", 0, [
        "form_a;form_b",
        "form_a",
        "form_c",
        "form_a",
        "form_b;form_c",
      ]),
    ).toMatchObject({ type: "list", listDelimiter: ";" });
    expect(
      profileColumn("type", 0, [
        "pay_change",
        "allowance_change",
        "pay_change",
        "exit",
        "pay_change",
        "exit",
      ]).type,
    ).toBe("category");
    expect(profileColumn("remote", 0, ["yes", "no", "Yes"]).type).toBe("boolean");
    expect(
      profileColumn("justification", 0, ["Market rate", "Retention after offer", "Promotion cycle"])
        .type,
    ).toBe("text");
  });

  it("keeps up to five distinct samples in file order", () => {
    expect(profileColumn("type", 0, ["a", "b", "a", "c", "d", "e", "f"]).samples).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("treats an all-blank column as text with every value blank", () => {
    expect(profileColumn("notes", 0, ["", " ", ""])).toMatchObject({
      type: "text",
      blankCount: 3,
      distinctCount: 0,
    });
  });
});
