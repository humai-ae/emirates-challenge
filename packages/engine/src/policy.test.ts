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
});
