import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CheckDatasetsService } from "../src/rules/check-datasets.service.js";
import { mappingOf, uploadPack } from "./packs.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";

describe("the dataset rules are matched against", () => {
  let t: TestApp;
  let service: CheckDatasetsService;
  let admin: Awaited<ReturnType<typeof signIn>>;
  beforeAll(async () => {
    t = await createTestApp();
    service = t.app.get(CheckDatasetsService);
    admin = await signIn(t, "layla.haddad@emirates.test");
  });
  afterAll(async () => {
    await t.close();
  });

  it("is missing until data is loaded", async () => {
    expect(await service.latest()).toBeNull();
  });

  it("prepares the newest ready dataset, with its columns and the values rules choose from", async () => {
    const uploaded = await uploadPack(admin);
    const loaded = await service.latest();
    expect(loaded?.id).toBe(uploaded.id);
    expect(loaded?.prepared.rows).toHaveLength(300);
    expect(loaded?.info).toMatchObject({
      id: uploaded.id,
      name: "Training pack",
      transactionCount: 300,
    });
    // The pack's justifications repeat a few phrases, so the column profiles as a category.
    expect(loaded?.info.columns).toContainEqual({
      name: "justification",
      type: "category",
      role: "text",
    });
    // Most frequent first: the pack has 88 allowance changes, 82 overtime claims and 70 pay changes.
    expect(loaded?.info.vocabulary.types.slice(0, 3)).toEqual([
      "allowance_change",
      "overtime",
      "pay_change",
    ]);
    expect(loaded?.info.vocabulary.documents).toEqual(
      expect.arrayContaining(["resignation_letter", "clearance_form"]),
    );
  });

  it("reuses the prepared dataset until its columns change", async () => {
    const first = await service.latest();
    expect(await service.latest()).toBe(first);
    const detail = await admin.get(`/api/v1/datasets/${first?.id}`).expect(200);
    await admin
      .patch(`/api/v1/datasets/${first?.id}/columns`)
      .set(CSRF)
      .send(mappingOf(detail.body.dataset.columns, ["documents"]))
      .expect(200);
    const reloaded = await service.latest();
    expect(reloaded).not.toBe(first);
    expect(reloaded?.prepared.roleColumn("transactions", "documents")).toBeUndefined();
    expect(reloaded?.info.vocabulary.documents).toEqual([]);
  });

  it("moves to a newer dataset, and back when that one is deleted", async () => {
    const older = await service.latest();
    const newer = await uploadPack(admin, "Second pack");
    expect((await service.latest())?.id).toBe(newer.id);
    await admin.delete(`/api/v1/datasets/${newer.id}`).set(CSRF).expect(200);
    expect((await service.latest())?.id).toBe(older?.id);
  });
});
