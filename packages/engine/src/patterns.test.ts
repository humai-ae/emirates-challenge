import type { PatternDetector } from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import {
  findPatterns,
  limitsOf,
  type PatternCandidate,
  patternKey,
  preselect,
  rankPatterns,
} from "./patterns.js";
import { columns, dataset, tx } from "./testing/dataset.js";

/** R-01's limit: allowance changes above 10,000. */
const LIMITS = [{ ruleId: "R-01", limit: 10_000, types: ["allowance_change"] }];
const of = (found: PatternCandidate[], detector: PatternDetector) =>
  found.filter((candidate) => candidate.detector === detector);
const factOf = (candidate: PatternCandidate | undefined, key: string) =>
  candidate?.facts.find((fact) => fact.key === key)?.value;

let counter = 0;
/** A transaction with its own ID; tests set only what they are about. */
function row(values: Record<string, string>): Record<string, string> {
  counter += 1;
  return tx({ transaction_id: `TX-${String(counter).padStart(4, "0")}`, ...values });
}
const times = <T>(count: number, make: (index: number) => T): T[] =>
  Array.from({ length: count }, (_, index) => make(index));

describe("just under a limit", () => {
  it("finds a requester's amounts just under a limit, and not someone who stays clear of it", () => {
    const rows = [
      // E-0003 keeps six of eight requests at 95–100% of the limit.
      ...times(6, (index) => row({ requester_id: "E-0003", amount: String(9_500 + index * 100) })),
      ...times(2, () => row({ requester_id: "E-0003", amount: "4000" })),
      // Others are spread out; one of E-0006's requests happens to sit near the limit.
      ...times(10, (index) => row({ requester_id: "E-0006", amount: String(1_000 + index * 500) })),
      row({ requester_id: "E-0006", amount: "9800" }),
      ...times(10, () => row({ requester_id: "E-0007", amount: "5000" })),
      ...times(10, (index) => row({ requester_id: "E-0005", amount: String(2_000 + index * 300) })),
      // Over the limit is a rule break, not "just under".
      row({ requester_id: "E-0007", amount: "15000" }),
    ];
    const found = of(findPatterns(dataset(rows), LIMITS), "just_under_limit");
    expect(found.map((candidate) => candidate.subject)).toEqual(["R-01:E-0003"]);
    const [candidate] = found;
    expect(factOf(candidate, "near_limit")).toBe(6);
    expect(factOf(candidate, "of")).toBe(8);
    expect(factOf(candidate, "requester")).toBe("E-0003");
    expect(factOf(candidate, "limit")).toBe(10_000);
    expect(candidate?.rows).toHaveLength(6);
    expect(candidate?.strength).toBeGreaterThan(0.5);
  });
});

describe("one approver outside the reporting line", () => {
  it("finds one approver outside the reporting line on almost all of a requester's transactions", () => {
    const rows = [
      // E-0006 (Cabin Services) has every request approved by E-0002, from Finance.
      ...times(10, () =>
        row({ requester_id: "E-0006", employee_id: "E-0006", approver_1_id: "E-0002" }),
      ),
      // E-0004's manager approves all of theirs: that's the reporting line, not a pattern.
      ...times(10, () => row({ requester_id: "E-0004", approver_1_id: "E-0003" })),
      // E-0007's approvals are shared out.
      ...times(5, () =>
        row({ requester_id: "E-0007", employee_id: "E-0007", approver_1_id: "E-0002" }),
      ),
      ...times(5, () =>
        row({ requester_id: "E-0007", employee_id: "E-0007", approver_1_id: "E-0003" }),
      ),
    ];
    const found = of(findPatterns(dataset(rows), []), "dominant_pair");
    expect(found.map((candidate) => candidate.subject)).toEqual(["E-0006:E-0002"]);
    expect(factOf(found[0], "approved")).toBe(10);
    expect(factOf(found[0], "in_reporting_line")).toBe("no");
  });
});

describe("off-hours approvals", () => {
  it("finds a team that approves off hours far more than everyone else", () => {
    const rows = [
      // Finance (E-0004's department) approves 18 of 30 late at night.
      ...times(18, () => row({ employee_id: "E-0004", approved_at: "2025-02-25 22:30" })),
      ...times(12, () => row({ employee_id: "E-0004", approved_at: "2025-02-25 11:00" })),
      // Cabin Services approves in working hours, bar two.
      ...times(38, () => row({ employee_id: "E-0007", approved_at: "2025-02-26 10:00" })),
      ...times(2, () => row({ employee_id: "E-0007", approved_at: "2025-02-26 06:15" })),
    ];
    const found = of(findPatterns(dataset(rows), []), "off_hours_approvals");
    expect(found.map((candidate) => candidate.subject)).toEqual(["Finance"]);
    expect(factOf(found[0], "off_hours")).toBe(18);
    expect(factOf(found[0], "of")).toBe(30);
  });
});

describe("backdating beyond the team's norm", () => {
  it("finds a transaction backdated far beyond its team's usual gap", () => {
    const submitted = (days: number) => {
      const date = new Date(Date.UTC(2025, 2, 1 + days));
      return `${date.toISOString().slice(0, 10)} 09:00`;
    };
    const rows = [
      // Finance usually submits 2–5 days after the effective date; one came 60 days late.
      ...times(20, (index) =>
        row({ employee_id: "E-0004", submitted_at: submitted(2 + (index % 4)) }),
      ),
      row({ transaction_id: "TX-LATE", employee_id: "E-0004", submitted_at: submitted(60) }),
      // Cabin Services is always slow (10–20 days): 22 days is within its norm.
      ...times(20, (index) =>
        row({ employee_id: "E-0007", submitted_at: submitted(10 + (index % 11)) }),
      ),
      row({ employee_id: "E-0007", submitted_at: submitted(22) }),
    ];
    const found = of(findPatterns(dataset(rows), []), "backdating");
    expect(found.map((candidate) => candidate.subject)).toEqual(["TX-LATE"]);
    expect(factOf(found[0], "days_late")).toBe(60);
    expect(factOf(found[0], "department")).toBe("Finance");
  });
});

describe("transactions a rule already flagged", () => {
  it("doesn't count a transaction a rule already flagged as backdated or rare", () => {
    const submitted = (days: number) => {
      const date = new Date(Date.UTC(2025, 2, 1 + days));
      return `${date.toISOString().slice(0, 10)} 09:00`;
    };
    const rows = [
      ...times(20, (index) =>
        row({ employee_id: "E-0004", submitted_at: submitted(2 + (index % 4)) }),
      ),
      row({ transaction_id: "TX-LATE", employee_id: "E-0004", submitted_at: submitted(60) }),
      ...times(38, () => row({ employee_id: "E-0004", type: "allowance_change" })),
      row({ transaction_id: "TX-RARE", employee_id: "E-0004", type: "transfer" }),
    ];
    const data = dataset(rows);
    const flaggedRows = new Set(
      data.rows
        .filter((item) => item.transactionId === "TX-LATE" || item.transactionId === "TX-RARE")
        .map((item) => item.index),
    );
    const found = findPatterns(data, [], { flaggedRows });
    expect(of(found, "backdating")).toEqual([]);
    expect(of(found, "rare_type")).toEqual([]);
    // Without the run's flags, both are found.
    expect(of(findPatterns(data, []), "backdating")).toHaveLength(1);
  });
});

describe("a rare transaction type", () => {
  it("finds a transaction type that is rare for a department", () => {
    const rows = [
      ...times(59, () => row({ employee_id: "E-0004", type: "allowance_change" })),
      row({ transaction_id: "TX-RARE", employee_id: "E-0004", type: "transfer" }),
      // Transfers are common in Cabin Services.
      ...times(40, () => row({ employee_id: "E-0007", type: "allowance_change" })),
      ...times(20, () => row({ employee_id: "E-0007", type: "transfer" })),
    ];
    const found = of(findPatterns(dataset(rows), []), "rare_type");
    expect(found.map((candidate) => candidate.subject)).toEqual(["TX-RARE"]);
    expect(factOf(found[0], "type")).toBe("transfer");
    expect(factOf(found[0], "count")).toBe(1);
    expect(factOf(found[0], "of")).toBe(60);
  });
});

describe("split requests", () => {
  it("finds an employee's transactions that each stay under a limit and together exceed it", () => {
    const rows = [
      row({
        transaction_id: "TX-S1",
        employee_id: "E-0004",
        amount: "4000",
        effective_date: "2025-03-01",
      }),
      row({
        transaction_id: "TX-S2",
        employee_id: "E-0004",
        amount: "4500",
        effective_date: "2025-03-03",
      }),
      row({
        transaction_id: "TX-S3",
        employee_id: "E-0004",
        amount: "3000",
        effective_date: "2025-03-05",
      }),
      // Together under the limit.
      row({ employee_id: "E-0007", amount: "4000", effective_date: "2025-03-01" }),
      row({ employee_id: "E-0007", amount: "3000", effective_date: "2025-03-03" }),
      // Each under the limit and together over it, but 20 days apart.
      row({ employee_id: "E-0006", amount: "6000", effective_date: "2025-03-01" }),
      row({ employee_id: "E-0006", amount: "6000", effective_date: "2025-03-21" }),
    ];
    const found = of(findPatterns(dataset(rows), LIMITS), "split_requests");
    expect(found.map((candidate) => candidate.subject)).toEqual(["R-01:E-0004:TX-S1"]);
    expect(factOf(found[0], "count")).toBe(3);
    expect(factOf(found[0], "total")).toBe(11_500);
    expect(found[0]?.rows).toHaveLength(3);
  });
});

describe("split requests with different reasons", () => {
  it("keeps split requests to transactions with the same reason", () => {
    const rows = [
      // A housing and a transport allowance in one week aren't one request split in two.
      row({
        employee_id: "E-0004",
        amount: "6000",
        effective_date: "2025-03-01",
        justification: "Housing",
      }),
      row({
        employee_id: "E-0004",
        amount: "6000",
        effective_date: "2025-03-02",
        justification: "Transport",
      }),
      row({
        transaction_id: "TX-H1",
        employee_id: "E-0007",
        amount: "6000",
        effective_date: "2025-03-01",
        justification: "Housing",
      }),
      row({
        employee_id: "E-0007",
        amount: "6000",
        effective_date: "2025-03-02",
        justification: "Housing",
      }),
    ];
    const found = of(findPatterns(dataset(rows), LIMITS), "split_requests");
    expect(found.map((candidate) => candidate.subject)).toEqual(["R-01:E-0007:TX-H1"]);
  });
});

describe("finding patterns", () => {
  it("skips a detector whose roles the data doesn't have", () => {
    const bare = columns("transactions", [
      ["transaction_id", "id", "transaction_id"],
      ["type", "category", "type"],
      ["employee_id", "id", "employee_id"],
    ]);
    const rows = [
      ...times(59, (index) => ({
        transaction_id: `B-${index}`,
        type: "pay_change",
        employee_id: "E-0004",
      })),
      { transaction_id: "B-RARE", type: "exit", employee_id: "E-0004" },
    ];
    const found = findPatterns(dataset(rows, { columns: bare }), LIMITS);
    // Only the rare type needs no more than a type and a department.
    expect(found.map((candidate) => candidate.detector)).toEqual(["rare_type"]);
  });

  it("finds the same patterns in the same order twice", () => {
    const rows = [
      ...times(6, (index) => row({ requester_id: "E-0003", amount: String(9_500 + index * 100) })),
      ...times(20, (index) =>
        row({ requester_id: "E-0006", employee_id: "E-0007", amount: String(1_000 + index * 200) }),
      ),
      ...times(59, () => row({ employee_id: "E-0004", type: "allowance_change" })),
      row({ employee_id: "E-0004", type: "transfer" }),
    ];
    const data = dataset(rows);
    expect(findPatterns(data, LIMITS)).toEqual(findPatterns(data, LIMITS));
  });

  it("takes the limits from the rules that have one, once each", () => {
    const limits = limitsOf(
      [
        {
          ruleId: "R-01",
          preset: "approver_min_grade",
          values: { types: ["allowance_change"], amount_limit: 10_000, min_approver_grade: 10 },
        },
        {
          ruleId: "R-02",
          preset: "required_field",
          values: { types: ["allowance_change"], field: "documents", amount_over: 10_000 },
        },
        {
          ruleId: "R-07",
          preset: "text_judgment",
          values: { types: ["pay_change"], text_field: "justification", amount_over: 5_000 },
        },
        {
          ruleId: "R-03",
          preset: "documents_present",
          values: { types: ["exit"], documents: ["clearance_form"] },
        },
      ],
      "amount",
    );
    expect(limits).toEqual([
      { ruleId: "R-01", limit: 10_000, types: ["allowance_change"] },
      { ruleId: "R-07", limit: 5_000, types: ["pay_change"] },
    ]);
  });
});

describe("ranking patterns", () => {
  const candidate = (
    detector: PatternDetector,
    subject: string,
    strength: number,
  ): PatternCandidate => ({
    detector,
    subject,
    strength,
    facts: [],
    rows: [0],
  });

  it("keeps every detector to its share", () => {
    const many = [
      ...times(30, (index) => candidate("backdating", `TX-${index}`, 0.9 - index * 0.01)),
      ...times(5, (index) => candidate("rare_type", `TX-R${index}`, 0.5)),
    ];
    const picked = preselect(many);
    expect(picked.filter((item) => item.detector === "backdating")).toHaveLength(15);
    expect(picked).toHaveLength(20);
    const ranked = rankPatterns(many, null);
    expect(ranked.filter((item) => item.detector === "backdating")).toHaveLength(8);
    expect(ranked).toHaveLength(13);
  });

  it("ranks by code alone without Jev, and mixes in Jev's concern when there is one", () => {
    const strong = candidate("just_under_limit", "R-01:E-0003", 0.8);
    const mild = candidate("rare_type", "TX-9", 0.6);
    const alone = rankPatterns([mild, strong], null);
    expect(
      alone.map((item) => [item.subject, item.combined, item.confidence, item.concern]),
    ).toEqual([
      ["R-01:E-0003", 0.8, "High", null],
      ["TX-9", 0.6, "Medium", null],
    ]);
    const concerns = new Map([
      [patternKey(strong), 0.1],
      [patternKey(mild), 0.9],
    ]);
    const mixed = rankPatterns([mild, strong], concerns);
    expect(mixed.map((item) => [item.subject, item.combined, item.confidence])).toEqual([
      ["TX-9", 0.75, "High"],
      ["R-01:E-0003", 0.45, "Medium"],
    ]);
  });
});
