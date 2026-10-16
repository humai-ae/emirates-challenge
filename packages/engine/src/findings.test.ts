import { DEFAULT_FINDING_VALUES } from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import {
  checkWorkedExamples,
  type FindingRow,
  flaggedKey,
  formatEvidence,
  learnValues,
  proposeMapping,
  renderFindingsCsv,
  ruleKey,
} from "./findings.js";

const row: FindingRow = {
  findingNo: 7,
  transactionId: "TX-000004",
  ruleId: "R-01",
  ruleTitle: "Approval of large allowance changes",
  severity: "High",
  description: "The amount 16,200 is over 10,000.",
  evidence: [{ field: "amount", value: "16200", condition: "> 10000" }],
  owner: "",
  recommendedAction: "Get approval from an approver at the required grade.",
  employeeId: "E-0004",
  transactionType: "allowance_change",
  department: "Finance",
  effectiveDate: "2025-02-20",
  amount: "16200",
  runId: "RUN-2026-10-16-01",
};

describe("finding formats", () => {
  it("proposes the field for each column from its name", () => {
    // The header of the brief's finding format.
    expect(
      proposeMapping([
        "finding_id",
        "transaction_id",
        "rule_id",
        "rule_name",
        "severity",
        "owner_team",
        "employee_id",
        "department",
        "explanation",
        "evidence",
        "suggested_action",
        "status",
      ]),
    ).toEqual([
      "finding_id",
      "transaction_id",
      "rule_id",
      "rule_title",
      "severity",
      "owner",
      "employee_id",
      "department",
      "description",
      "evidence",
      "recommended_action",
      "status",
    ]);
    expect(proposeMapping(["Txn ID", "Rule", "Risk Level", "Notes", "Rule ID"])).toEqual([
      "transaction_id",
      "rule_id",
      "severity",
      null,
      null,
    ]);
  });

  it("learns how the examples write severity, finding IDs and dates", () => {
    const mapping = proposeMapping([
      "finding_id",
      "transaction_id",
      "rule_id",
      "severity",
      "effective_date",
    ]);
    expect(
      learnValues(
        [
          ["FND-001", "TX-1", "R01", "HIGH", "20/02/2025"],
          ["FND-002", "TX-2", "R02", "LOW", "13/03/2025"],
        ],
        mapping,
      ),
    ).toEqual({
      severity: "upper",
      findingIdPrefix: "FND-",
      findingIdWidth: 3,
      dateFormat: "DD/MM/YYYY",
      status: "OPEN",
    });
    expect(learnValues([["1", "TX-1", "R01", "M", ""]], mapping)).toEqual({
      severity: "letter",
      findingIdPrefix: "",
      findingIdWidth: 1,
      dateFormat: null,
      status: "OPEN",
    });
    const withStatus = proposeMapping(["transaction_id", "rule_id", "status"]);
    expect(learnValues([["TX-1", "R01", "Open"]], withStatus).status).toBe("Open");
    expect(learnValues([], mapping)).toEqual(DEFAULT_FINDING_VALUES);
  });

  it("writes the findings in the format's columns and styles", () => {
    const csv = renderFindingsCsv(
      ["Finding", "Transaction", "Rule", "Severity", "Date", "Notes", "Status"],
      ["finding_id", "transaction_id", "rule_id", "severity", "effective_date", null, "status"],
      {
        severity: "upper",
        findingIdPrefix: "FND-",
        findingIdWidth: 3,
        dateFormat: "DD/MM/YYYY",
        status: "OPEN",
      },
      [row],
    );
    expect(csv).toBe(
      "Finding,Transaction,Rule,Severity,Date,Notes,Status\nFND-007,TX-000004,R-01,HIGH,20/02/2025,,OPEN\n",
    );
  });

  it("quotes commas, quotes and line breaks, and writes evidence as field=value", () => {
    const evidence = [
      { field: "amount", value: "16200", condition: "> 10000" },
      { field: "approvers[].grade", value: ["8", "9"], condition: "none >= 10" },
    ];
    expect(formatEvidence(evidence)).toBe(
      "amount=16200 (> 10000); approvers[].grade=8, 9 (none >= 10)",
    );
    const csv = renderFindingsCsv(
      ["transaction_id", "rule_id", "description", "evidence"],
      ["transaction_id", "rule_id", "description", "evidence"],
      DEFAULT_FINDING_VALUES,
      [{ ...row, description: 'Said "urgent", twice\nthen approved', evidence }],
    );
    expect(csv).toBe(
      'transaction_id,rule_id,description,evidence\nTX-000004,R-01,"Said ""urgent"", twice\nthen approved","amount=16200 (> 10000); approvers[].grade=8, 9 (none >= 10)"\n',
    );
  });

  it("keeps a spreadsheet from running a cell as a formula", () => {
    const csv = renderFindingsCsv(
      ["description", "owner", "recommended_action", "amount"],
      ["description", "owner", "recommended_action", "amount"],
      DEFAULT_FINDING_VALUES,
      [
        {
          ...row,
          description: "=HYPERLINK(1)",
          owner: "@team",
          recommendedAction: "+971 call",
          amount: "-500",
        },
      ],
    );
    expect(csv.split("\n")[1]).toBe("'=HYPERLINK(1),'@team,'+971 call,-500");
  });

  it("checks the worked examples against the run", () => {
    const mapping = proposeMapping(["finding_id", "transaction_id", "rule_id"]);
    const examples = [
      ["F-1", "TX-1", "R01"],
      ["F-2", "TX-2", "R-01"],
      ["F-3", "TX-1", "R-09"],
      ["F-4", "TX-404", "R-01"],
      ["F-5", "TX-1", ""],
    ];
    const run = {
      ruleIds: ["R-01", "R-02"],
      flagged: new Set([flaggedKey("TX-1", "R-01")]),
      transactionIds: new Set(["TX-1", "TX-2"]),
    };
    expect(checkWorkedExamples(examples, mapping, run).map((example) => example.result)).toEqual([
      "found",
      "not_flagged",
      "rule_not_run",
      "transaction_not_found",
      "incomplete",
    ]);
    expect(checkWorkedExamples(examples, mapping, run)[0]).toEqual({
      row: 1,
      transactionId: "TX-1",
      ruleId: "R01",
      result: "found",
    });
  });

  it("treats R-01, r01 and R01 as the same rule", () => {
    expect(ruleKey("R-01")).toBe(ruleKey("r01"));
    expect(ruleKey("R01")).toBe("R01");
    expect(flaggedKey("TX-1", "R-01")).toBe(flaggedKey("TX-1", "R01"));
  });
});
