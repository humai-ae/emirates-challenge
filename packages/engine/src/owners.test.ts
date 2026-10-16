import { describe, expect, it } from "vitest";
import { findOwnerTable } from "./owners.js";

const POLICY = `# HR policy rules (synthetic)

## How to read these rules

- Who owns a finding depends on the transaction type:

| Transaction type | Owner team |
|---|---|
| PAY_CHANGE | Payroll Operations |
| \`ALLOWANCE_CHANGE\` | Payroll Operations |
| HIRE | Talent Acquisition |
| LEAVE | Employee Services |

| Severity | Due in |
|---|---|
| High | 3 days |

## Rules

### R01: Allowance changes over AED 3,000 need HR Manager approval
`;

describe("owner teams in a policy", () => {
  it("reads the owner team of each transaction type the data has", () => {
    expect(findOwnerTable(POLICY, ["pay_change", "allowance_change", "hire", "exit"])).toEqual([
      { type: "pay_change", team: "Payroll Operations" },
      { type: "allowance_change", team: "Payroll Operations" },
      { type: "hire", team: "Talent Acquisition" },
    ]);
  });

  it("ignores tables without a type column and a team column", () => {
    expect(
      findOwnerTable("| Severity | Due in |\n|---|---|\n| High | 3 days |\n", ["High"]),
    ).toEqual([]);
    expect(findOwnerTable("No tables here.", ["pay_change"])).toEqual([]);
  });
});
