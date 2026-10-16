import type { Check } from "@hrcc/shared";
import type { QueryDeepPartialEntity } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RuleEntity, RuleVersionEntity, UserEntity } from "../src/database/entities/index.js";
import { createTestApp, type TestApp } from "./test-app.js";

const CHECK: Check = {
  checkKind: "structured",
  preset: "requester_not_approver",
  appliesTo: true,
  logic: {
    some: [{ var: "approvers[]" }, { same_person: [{ var: "" }, { var: "requester_id" }] }],
  },
  fieldsUsed: ["approvers[]", "requester_id"],
  parameters: [{ name: "types", type: "string[]", value: null, editedByAdmin: false }],
};

describe("rule tables", () => {
  let t: TestApp;
  let adminId: string;
  beforeAll(async () => {
    t = await createTestApp();
    const admin = await t.dataSource
      .getRepository(UserEntity)
      .findOneByOrFail({ email: "layla.haddad@emirates.test" });
    adminId = admin.id;
  });
  afterAll(async () => {
    await t.close();
  });

  async function rule(id: string) {
    await t.dataSource
      .getRepository(RuleEntity)
      .insert({ id, title: "No self-approval", rowVersion: 1, createdById: adminId });
  }

  function version(ruleId: string, overrides: Partial<RuleVersionEntity> = {}) {
    // TypeORM's insert type maps the check's untyped expressions to `{}`; the row is complete.
    return {
      ruleId,
      version: 1,
      status: "draft" as RuleVersionEntity["status"],
      sourceText: "The person who requests a transaction must not also approve it.",
      policyUploadId: null,
      preset: "requester_not_approver" as RuleVersionEntity["preset"],
      parameters: CHECK.parameters,
      check: CHECK,
      needs: [],
      restatementEn: "Flags transactions where the requester is also one of the approvers.",
      restatementAr: "يُبلَّغ عن المعاملات عندما يكون مقدِّم الطلب أحد المعتمِدين أيضًا.",
      severity: "High" as RuleVersionEntity["severity"],
      ownerTeamId: null,
      suggestedActionEn: "Have someone other than the requester approve the transaction.",
      suggestedActionAr: "اطلب اعتماد المعاملة من شخص غير مقدِّم الطلب.",
      draftedBy: "keywords" as RuleVersionEntity["draftedBy"],
      draftError: null,
      datasetId: null,
      createdById: adminId,
      approvedById: null,
      approvedAt: null,
      closedById: null,
      closedAt: null,
      reason: null,
      closedFor: null,
      ...overrides,
    } as QueryDeepPartialEntity<RuleVersionEntity>;
  }

  it("creates the rule tables", async () => {
    const rows: Array<{ table_name: string }> = await t.dataSource.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    expect(rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining(["policy_uploads", "rules", "rule_versions"]),
    );
  });

  it("reads a version back with its check and the people who acted on it", async () => {
    await rule("R-01");
    const repository = t.dataSource.getRepository(RuleVersionEntity);
    await repository.insert(version("R-01"));
    const loaded = await repository.findOneOrFail({
      where: { ruleId: "R-01", version: 1 },
      relations: { createdBy: true, approvedBy: true, closedBy: true, ownerTeam: true },
    });
    expect(loaded).toMatchObject({ status: "draft", check: CHECK, parameters: CHECK.parameters });
    expect(loaded.createdBy.displayName).toBe("Layla Haddad");
    expect(loaded.approvedBy).toBeNull();
  });

  it("allows one live version and one open draft per rule", async () => {
    await rule("R-02");
    const repository = t.dataSource.getRepository(RuleVersionEntity);
    const approved = { approvedById: adminId, approvedAt: new Date() };
    await repository.insert(version("R-02", { version: 1, status: "active", ...approved }));
    await repository.insert(version("R-02", { version: 2, status: "draft" }));
    await expect(
      repository.insert(
        version("R-02", {
          version: 3,
          status: "needs_data",
          check: null,
          needs: [{ file: "transactions", role: "approver_ids" }],
        }),
      ),
    ).rejects.toThrow(/rule_versions_one_open/);
    await expect(
      repository.insert(version("R-02", { version: 3, status: "active", ...approved })),
    ).rejects.toThrow(/rule_versions_one_active/);
  });

  it("keeps status, check, approval and closing consistent", async () => {
    await rule("R-03");
    const repository = t.dataSource.getRepository(RuleVersionEntity);
    await expect(repository.insert(version("R-03", { check: null }))).rejects.toThrow(
      /rule_versions_check_present/,
    );
    await expect(
      repository.insert(version("R-03", { status: "draft_failed", preset: null, check: null })),
    ).rejects.toThrow(/rule_versions_check_present/);
    await expect(repository.insert(version("R-03", { status: "active" }))).rejects.toThrow(
      /rule_versions_active_approved/,
    );
    await expect(repository.insert(version("R-03", { status: "rejected" }))).rejects.toThrow(
      /rule_versions_closed/,
    );
    const closed = { closedById: adminId, closedAt: new Date() };
    await expect(
      repository.insert(version("R-03", { status: "rejected", ...closed })),
    ).rejects.toThrow(/rule_versions_closed_why/);
    await expect(
      repository.insert(version("R-03", { status: "rejected", ...closed, reason: "Duplicate" })),
    ).resolves.toBeDefined();
  });
});
