import { DEFAULT_FLAG_SETTINGS } from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import {
  bandOf,
  datasetBands,
  dubaiDay,
  dueDateFor,
  flagPeople,
  flagSeverity,
  proposeBands,
  raiseSeverity,
  reportTo,
  reportToPerson,
  ruleAmountLimit,
} from "./flags.js";
import { dataset, tx } from "./testing/dataset.js";

const base = {
  kind: "rule_break" as const,
  confidence: null,
  amount: null,
  amountLimit: null,
  repeat: null,
};
const repeat = { flagId: "F-000002", person: "employee" as const, personId: "E-0004" };

describe("flag severity", () => {
  it("starts from the rule's severity", () => {
    expect(flagSeverity({ ...base, ruleSeverity: "Medium" })).toEqual({
      severity: "Medium",
      reasons: [{ code: "rule_default", severity: "Medium" }],
    });
  });

  it("goes one level up for an amount over twice the limit, not at exactly twice", () => {
    expect(
      flagSeverity({ ...base, ruleSeverity: "Medium", amount: 25_000, amountLimit: 10_000 }),
    ).toEqual({
      severity: "High",
      reasons: [
        { code: "rule_default", severity: "Medium" },
        { code: "amount_over_double_limit", amount: 25_000, limit: 10_000 },
      ],
    });
    expect(
      flagSeverity({ ...base, ruleSeverity: "Medium", amount: 20_000, amountLimit: 10_000 })
        .severity,
    ).toBe("Medium");
  });

  it("goes one level up for each modifier, and gives no reason when High can't go higher", () => {
    expect(
      flagSeverity({ ...base, ruleSeverity: "Low", amount: 30_000, amountLimit: 10_000, repeat }),
    ).toEqual({
      severity: "High",
      reasons: [
        { code: "rule_default", severity: "Low" },
        { code: "amount_over_double_limit", amount: 30_000, limit: 10_000 },
        { code: "repeat_open_flag", ...repeat },
      ],
    });
    expect(
      flagSeverity({ ...base, ruleSeverity: "High", amount: 30_000, amountLimit: 10_000, repeat })
        .reasons,
    ).toEqual([{ code: "rule_default", severity: "High" }]);
  });

  it("keeps an unsure AI judgment at Medium until an analyst confirms it", () => {
    expect(
      flagSeverity({ ...base, kind: "ai_judgment", confidence: "Low", ruleSeverity: "High" }),
    ).toEqual({
      severity: "Medium",
      reasons: [{ code: "rule_default", severity: "High" }, { code: "low_confidence_cap" }],
    });
    expect(
      flagSeverity({ ...base, kind: "ai_judgment", confidence: "High", ruleSeverity: "High" })
        .severity,
    ).toBe("High");
  });

  it("raises Low to Medium to High and no further", () => {
    expect([raiseSeverity("Low"), raiseSeverity("Medium"), raiseSeverity("High")]).toEqual([
      "Medium",
      "High",
      "High",
    ]);
  });
});

describe("a rule's amount limit", () => {
  it("reads the limit each check type compares against", () => {
    expect(
      ruleAmountLimit(
        "approver_min_grade",
        { amount_limit: 10_000, min_approver_grade: 10 },
        "amount",
      ),
    ).toBe(10_000);
    expect(
      ruleAmountLimit("required_field", { field: "justification", amount_over: 5_000 }, "amount"),
    ).toBe(5_000);
    expect(
      ruleAmountLimit("field_compare", { field: "amount", operator: ">", value: 50_000 }, "amount"),
    ).toBe(50_000);
    expect(
      ruleAmountLimit("field_compare", { field: "leave_days", operator: ">", value: 30 }, "amount"),
    ).toBeNull();
    expect(
      ruleAmountLimit("field_compare", { field: "amount", operator: "<", value: 0 }, "amount"),
    ).toBeNull();
    expect(ruleAmountLimit("requester_not_approver", { types: null }, "amount")).toBeNull();
  });
});

describe("due dates", () => {
  it("counts calendar days from the Dubai day the flag was raised", () => {
    expect(dubaiDay(new Date("2026-10-16T21:30:00Z"))).toBe("2026-10-17");
    expect(dueDateFor("2026-10-16", "High", DEFAULT_FLAG_SETTINGS.dueDays)).toBe("2026-10-19");
    expect(dueDateFor("2026-10-30", "Low", DEFAULT_FLAG_SETTINGS.dueDays)).toBe("2026-11-13");
  });
});

describe("seniority bands", () => {
  it("splits the grades at their quartiles", () => {
    expect(proposeBands([1, 2, 3, 4, 5, 6, 7, 8])).toEqual({
      juniorMax: 2,
      midMax: 4,
      seniorMax: 6,
    });
    expect(proposeBands([])).toBeNull();
    const bands = { juniorMax: 3, midMax: 6, seniorMax: 10 };
    expect([3, 4, 10, 11].map((grade) => bandOf(grade, bands))).toEqual([
      "junior",
      "mid",
      "senior",
      "executive",
    ]);
  });

  it("reads the employees file's grades and skips blanks", () => {
    // Grades 15, 12, 9, 7, 10, 6, 8 and one blank.
    expect(datasetBands(dataset([tx()]))).toEqual({ juniorMax: 7, midMax: 9, seniorMax: 12 });
  });
});

describe("the people a flag involves", () => {
  it("lists the employee, requester and approvers with what the employees file says", () => {
    expect(flagPeople(dataset([tx({ approver_2_id: "E-0099" })]), 0)).toEqual([
      { role: "employee", id: "E-0004", found: true, grade: "7", department: "Finance" },
      { role: "requester", id: "E-0003", found: true, grade: "9", department: "Finance" },
      { role: "approver", id: "E-0002", found: true, grade: "12", department: "Finance" },
      { role: "approver", id: "E-0099", found: false, grade: null, department: null },
    ]);
  });
});

describe("report-to level", () => {
  const people = flagPeople(dataset([tx()]), 0);
  const bands = { juniorMax: 7, midMax: 9, seniorMax: 12 };
  const matrix = DEFAULT_FLAG_SETTINGS.reportTo;

  it("crosses the most senior person's band with the severity", () => {
    // The approver E-0002 (grade 12) is the most senior: the senior band.
    expect(reportTo({ severity: "High", people, bands, matrix })).toEqual({
      level: "hr_director",
      severity: "High",
      band: "senior",
      basis: { role: "approver", id: "E-0002", grade: 12 },
    });
    expect(reportTo({ severity: "Low", people, bands, matrix }).level).toBe("dept_head");
  });

  it("uses the mid band when no grade is known", () => {
    const unknown = people.map((person) => ({ ...person, grade: null }));
    expect(reportTo({ severity: "Medium", people: unknown, bands, matrix })).toEqual({
      level: "dept_head",
      severity: "Medium",
      band: "mid",
      basis: null,
    });
  });

  it("names the line manager and the department head from the reporting line", () => {
    const data = dataset([tx()]);
    expect(reportToPerson("line_manager", "E-0004", data)).toBe("E-0003");
    // E-0004 → E-0003 → E-0002 (all Finance) → E-0001 (Executive Office).
    expect(reportToPerson("dept_head", "E-0004", data)).toBe("E-0002");
    expect(reportToPerson("hr_manager", "E-0004", data)).toBeNull();
    expect(reportToPerson("line_manager", "E-0099", data)).toBeNull();
    expect(reportToPerson("dept_head", "E-0001", data)).toBeNull();
  });
});
