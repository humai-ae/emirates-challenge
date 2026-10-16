import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./test-app.js";

describe("drafting, request and routing tables", () => {
  let t: TestApp;
  let adminId: string;
  let teamId: string;
  beforeAll(async () => {
    t = await createTestApp();
    [{ id: adminId }] = await t.dataSource.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1",
    );
    [{ id: teamId }] = await t.dataSource.query("SELECT id FROM teams LIMIT 1");
  });
  afterAll(async () => {
    await t.close();
  });

  async function rule(id: string) {
    await t.dataSource.query(
      "INSERT INTO rules (id, title, created_by) VALUES ($1, 'A rule', $2)",
      [id, adminId],
    );
  }

  /** A version row with every required column; `extra` sets the columns a test is about. */
  function version(ruleId: string, number: number, extra: Record<string, unknown>) {
    const row: Record<string, unknown> = {
      rule_id: ruleId,
      version: number,
      status: "drafting",
      source_text: "The person who requests a transaction must not also approve it.",
      severity: "Medium",
      suggested_action_en: "Check the transaction.",
      suggested_action_ar: "راجع المعاملة.",
      drafted_by: "ai",
      created_by: adminId,
      ...extra,
    };
    const columns = Object.keys(row);
    return t.dataSource.query(
      `INSERT INTO rule_versions (${columns.join(", ")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})`,
      Object.values(row),
    );
  }

  it("stores a version being drafted, without a check, and how AI drafted another", async () => {
    await rule("D-01");
    await version("D-01", 1, {});
    await rule("D-02");
    await version("D-02", 1, {
      status: "draft_failed",
      preset: "approver_min_grade",
      draft_error: "incomplete",
      draft_meta: JSON.stringify({
        ai: {
          model: "jev-1.13.0",
          questionSet: "rule-draft-v1",
          confidence: 0.4,
          weakest: "amount_limit",
        },
        aiProblem: null,
        suggestedActionBy: "ai",
      }),
    });
    const [row] = await t.dataSource.query(
      "SELECT draft_meta FROM rule_versions WHERE rule_id = 'D-02'",
    );
    expect(row.draft_meta.ai.weakest).toBe("amount_limit");
  });

  it("refuses a drafting version with a check, and a second open version of a rule", async () => {
    await rule("D-03");
    await expect(
      version("D-03", 1, {
        check_definition: JSON.stringify({ preset: "requester_not_approver" }),
        preset: "requester_not_approver",
      }),
    ).rejects.toThrow(/rule_versions_check_present/);
    await version("D-03", 1, {});
    await expect(
      version("D-03", 2, {
        status: "draft_failed",
        draft_error: "no_match",
        drafted_by: "keywords",
      }),
    ).rejects.toThrow(/rule_versions_one_open/);
  });

  it("keeps who asked for a rule, and one routing row per transaction type", async () => {
    await t.dataSource.query(
      "INSERT INTO rules (id, title, created_by, requested_by) VALUES ('W-90', 'Asked for', $1, $1)",
      [adminId],
    );
    await t.dataSource.query(
      "INSERT INTO routing_rules (transaction_type, team_id, set_by) VALUES ('pay_change', $1, $2)",
      [teamId, adminId],
    );
    await expect(
      t.dataSource.query(
        "INSERT INTO routing_rules (transaction_type, team_id, set_by) VALUES ('pay_change', $1, $2)",
        [teamId, adminId],
      ),
    ).rejects.toThrow(/routing_rules_pkey/);
    const [upload] = await t.dataSource.query(
      "SELECT column_default FROM information_schema.columns WHERE table_name = 'policy_uploads' AND column_name = 'owner_table'",
    );
    expect(upload.column_default).toContain("'[]'");
  });
});
