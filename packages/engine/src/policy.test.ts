import { describe, expect, it } from "vitest";
import { splitPolicy } from "./policy.js";

const MARKDOWN = `# HR transaction policy (synthetic sample)

## R-01 Approval of large allowance changes
Allowance changes above AED 10,000 must be approved by at least one approver at Grade 10 or above.

## R-02 No self-approval
The person who requests a transaction must not also approve it.

## R-03 Exit documents
Every exit must have a resignation letter and a clearance form attached.
`;

describe("splitPolicy", () => {
  it("cuts a Markdown policy at the headings that carry rule IDs", () => {
    const { rules, warnings } = splitPolicy(MARKDOWN);
    expect(rules.map((rule) => rule.id)).toEqual(["R-01", "R-02", "R-03"]);
    expect(rules[0]).toEqual({
      id: "R-01",
      title: "Approval of large allowance changes",
      text: "Allowance changes above AED 10,000 must be approved by at least one approver at Grade 10 or above.",
    });
    expect(warnings).toEqual([]);
  });

  it("reads rules written one per line with their ID first", () => {
    const { rules } = splitPolicy(`Transaction Control Policy (sample)

R-01 Allowance approval limit. Allowance changes above AED 10,000 must be approved by an approver at Grade 10 or above.
R-02 Segregation of duties. The person who requests a transaction must not also approve it.
`);
    expect(rules).toEqual([
      {
        id: "R-01",
        title: "Allowance approval limit",
        text: "Allowance changes above AED 10,000 must be approved by an approver at Grade 10 or above.",
      },
      {
        id: "R-02",
        title: "Segregation of duties",
        text: "The person who requests a transaction must not also approve it.",
      },
    ]);
  });

  it("numbers headings that have no IDs", () => {
    const { rules } = splitPolicy(`# Policy

## Self-approval
The requester must not approve.

## Exit documents
Every exit needs a clearance form.
`);
    expect(rules.map(({ id, title }) => [id, title])).toEqual([
      ["R-01", "Self-approval"],
      ["R-02", "Exit documents"],
    ]);
  });

  it("numbers a plain numbered list", () => {
    const { rules } = splitPolicy(
      "1. Requesters must not approve their own requests.\n2. Exits need a clearance form.\n",
    );
    expect(rules).toEqual([
      {
        id: "R-01",
        title: "Requesters must not approve their own requests",
        text: "Requesters must not approve their own requests.",
      },
      { id: "R-02", title: "Exits need a clearance form", text: "Exits need a clearance form." },
    ]);
  });

  it("renames a repeated ID and says so", () => {
    const { rules, warnings } = splitPolicy(
      "## R-04 Timing\nApproved first.\n\n## R-04 Timing again\nApproved before.\n",
    );
    expect(rules.map((rule) => rule.id)).toEqual(["R-04", "R-04b"]);
    expect(warnings).toEqual([{ code: "duplicate_id", id: "R-04", renamedTo: "R-04b" }]);
  });

  it("keeps a document with no structure as one rule, with a warning", () => {
    expect(splitPolicy("Pay changes must be approved before they take effect.\n")).toEqual({
      rules: [
        {
          id: "R-01",
          title: "Pay changes must be approved before they take effect",
          text: "Pay changes must be approved before they take effect.",
        },
      ],
      warnings: [{ code: "no_structure", id: null, renamedTo: null }],
    });
    expect(splitPolicy("  \n\n")).toEqual({
      rules: [],
      warnings: [{ code: "no_structure", id: null, renamedTo: null }],
    });
  });

  it("uses the title as the text of a heading with nothing under it", () => {
    const { rules, warnings } = splitPolicy(
      "## R-01 Self-approval\n## R-02 Exit documents\nEvery exit needs a clearance form.\n",
    );
    expect(rules[0]).toEqual({ id: "R-01", title: "Self-approval", text: "Self-approval" });
    expect(warnings).toEqual([{ code: "empty_rule", id: "R-01", renamedTo: null }]);
  });

  it("reads Windows line endings and drops Markdown emphasis", () => {
    const { rules } = splitPolicy(
      "## r-01 **Self-approval**\r\nThe requester must __not__ approve.\r\n",
    );
    expect(rules).toEqual([
      { id: "R-01", title: "Self-approval", text: "The requester must not approve." },
    ]);
  });
  it("keeps a one-line rule's first sentence when it is the rule itself", () => {
    const { rules } = splitPolicy(
      "1. Requesters must not approve their own requests. This includes delegated approvals.\n2. Exits need a clearance form.\n",
    );
    expect(rules[0]).toEqual({
      id: "R-01",
      title: "Requesters must not approve their own requests",
      text: "Requesters must not approve their own requests. This includes delegated approvals.",
    });
  });

  it("doesn't let a word like Covid-19 at the start of a line take over the document", () => {
    const { rules, warnings } = splitPolicy(`# Policy

## Self-approval
The requester must not approve.
Covid-19 arrangements no longer apply.

## Exit documents
Every exit needs a clearance form.
`);
    expect(rules).toEqual([
      {
        id: "R-01",
        title: "Self-approval",
        text: "The requester must not approve.\nCovid-19 arrangements no longer apply.",
      },
      { id: "R-02", title: "Exit documents", text: "Every exit needs a clearance form." },
    ]);
    expect(warnings).toEqual([]);
  });

  it("doesn't take words like Pre-2020 or Grade-10 for rule IDs", () => {
    const { rules, warnings } = splitPolicy(
      "Pre-2020 transactions are out of scope.\nGrade-10 approvers may sign allowance changes.\n",
    );
    expect(rules.map((rule) => rule.id)).toEqual(["R-01"]);
    expect(warnings).toEqual([{ code: "no_structure", id: null, renamedTo: null }]);
  });

  it("drops no heading when only one of them looks like it has an ID", () => {
    const { rules } = splitPolicy(
      "## Self-approval\nA.\n\n## COVID-19 arrangements\nB.\n\n## Exit documents\nC.\n",
    );
    expect(rules.map(({ id, title, text }) => [id, title, text])).toEqual([
      ["R-01", "Self-approval", "A."],
      ["COVID-19", "arrangements", "B."],
      ["R-02", "Exit documents", "C."],
    ]);
  });

  it("reads rule IDs under section headings, and leaves sections out", () => {
    const { rules } = splitPolicy(
      "## Purpose\nWhy.\n## R-01 Large changes\nText one.\n## R-02 Self-approval\nText two.\n",
    );
    expect(rules.map((rule) => rule.id)).toEqual(["R-01", "R-02"]);
    const nested = splitPolicy(
      "## Approvals\n### R-01 Large changes\nOne.\n### R-02 Self-approval\nTwo.\n## Documents\n### R-03 Exit\nThree.\n",
    );
    expect(nested.rules.map((rule) => rule.id)).toEqual(["R-01", "R-02", "R-03"]);
  });
  it("keeps rule IDs written without a hyphen, such as R01", () => {
    const { rules, warnings } = splitPolicy(`# HR policy rules (synthetic)

## How to read these rules

- **More than** means strictly greater.

## Rules

### R01: Allowance changes over AED 3,000 need HR Manager or HR Director approval

- **Applies to:** ALLOWANCE_CHANGE
- **Rule:** If an allowance change is more than AED 3,000, at least one approver must have HR_MANAGER authority.

### r04: The requester cannot also approve the transaction

- **Applies to:** All
- **Rule:** The person in requester_id must not appear as any approver.
`);
    expect(rules.map(({ id, title }) => [id, title])).toEqual([
      ["R01", "Allowance changes over AED 3,000 need HR Manager or HR Director approval"],
      ["R04", "The requester cannot also approve the transaction"],
    ]);
    expect(rules[1]?.text).toBe(
      "- Applies to: All\n- Rule: The person in requester_id must not appear as any approver.",
    );
    expect(warnings).toEqual([]);
  });
});
