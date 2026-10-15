import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generatePack, RULE_IDS } from "./generate.ts";

const SMALL = { seed: 7, employees: 60, transactions: 300 } as const;

type Row = Record<string, string>;

function rows(csv: string): Row[] {
  const [header, ...lines] = csv.trim().split("\n");
  const names = (header ?? "").split(",");
  return lines.map((line) =>
    Object.fromEntries(line.split(",").map((value, index) => [names[index] ?? "", value])),
  );
}

const DAY_MS = 86_400_000;
const day = (value: string) => Date.parse(`${value.slice(0, 10)}T00:00:00Z`);

/** The rule breaks actually present in the data, worked out independently of the generator. */
function findBreaks(transactions: Row[], employees: Row[]): string[] {
  const grade = new Map(employees.map((row) => [row.employee_id ?? "", Number(row.grade)]));
  const breaks: string[] = [];
  for (const row of transactions) {
    const id = row.transaction_id ?? "";
    const approvers = [row.approver_1_id, row.approver_2_id].filter(
      (value): value is string => !!value,
    );
    const amount = row.amount ? Number(row.amount) : null;
    const known = approvers
      .map((approver) => grade.get(approver))
      .filter((value): value is number => value !== undefined);
    if (
      row.type === "allowance_change" &&
      amount !== null &&
      amount > 10_000 &&
      known.length > 0 &&
      Math.max(...known) < 10
    ) {
      breaks.push(`${id}|R-01`);
    }
    if (approvers.includes(row.requester_id ?? "")) breaks.push(`${id}|R-02`);
    const documents = (row.documents ?? "").split(";");
    if (
      row.type === "exit" &&
      !(documents.includes("resignation_letter") && documents.includes("clearance_form"))
    ) {
      breaks.push(`${id}|R-03`);
    }
    if (row.type === "pay_change" && day(row.approved_at ?? "") > day(row.effective_date ?? "")) {
      breaks.push(`${id}|R-04`);
    }
    if (row.type === "allowance_change") {
      const effective = day(row.effective_date ?? "");
      const inWindow = transactions.filter(
        (other) =>
          other.type === "allowance_change" &&
          other.employee_id === row.employee_id &&
          day(other.effective_date ?? "") <= effective &&
          day(other.effective_date ?? "") > effective - 365 * DAY_MS,
      ).length;
      if (inWindow > 2) breaks.push(`${id}|R-05`);
    }
    if (row.type === "pay_change" && amount !== null && amount > 5_000 && !row.justification) {
      breaks.push(`${id}|R-06`);
    }
  }
  return breaks;
}

describe("generatePack", () => {
  it("is deterministic", () => {
    expect(generatePack(SMALL)).toEqual(generatePack(SMALL));
    expect(generatePack({ ...SMALL, seed: 8 }).files["transactions.csv"]).not.toBe(
      generatePack(SMALL).files["transactions.csv"],
    );
  });

  it("matches the committed small pack", () => {
    const pack = generatePack(SMALL);
    for (const [name, content] of Object.entries(pack.files)) {
      expect(
        readFileSync(new URL(`../fixtures/small/${name}`, import.meta.url), "utf8"),
        name,
      ).toBe(content);
    }
  });

  it("writes the requested rows with plain values", () => {
    const pack = generatePack(SMALL);
    expect(rows(pack.files["transactions.csv"])).toHaveLength(300);
    expect(rows(pack.files["employees.csv"])).toHaveLength(60);
    for (const file of [
      "transactions.csv",
      "employees.csv",
      "finding_format.csv",
      "answer_key.csv",
    ] as const) {
      expect(pack.files[file]).not.toMatch(/"/);
    }
    expect(rows(pack.files["finding_format.csv"])).toHaveLength(5);
  });

  it("plants the data issues an upload should report", () => {
    const pack = generatePack(SMALL);
    const transactions = rows(pack.files["transactions.csv"]);
    const employeeIds = new Set(rows(pack.files["employees.csv"]).map((row) => row.employee_id));
    expect(
      transactions.some((row) => row.approver_1_id && !employeeIds.has(row.approver_1_id)),
    ).toBe(true);
    expect(transactions.some((row) => !row.approver_1_id && !row.approver_2_id)).toBe(true);
    const ids = transactions.map((row) => row.transaction_id);
    expect(new Set(ids).size).toBe(ids.length - 1);
  });

  it("lists exactly the rule breaks that are in the data", () => {
    const pack = generatePack({ seed: 7, employees: 400, transactions: 3000 });
    const expected = pack.answerKey.map((row) => `${row.transactionId}|${row.ruleId}`).sort();
    const found = findBreaks(
      rows(pack.files["transactions.csv"]),
      rows(pack.files["employees.csv"]),
    ).sort();
    expect(found).toEqual(expected);
    for (const ruleId of RULE_IDS) {
      expect(
        pack.answerKey.some((row) => row.ruleId === ruleId),
        ruleId,
      ).toBe(true);
    }
  });
});
