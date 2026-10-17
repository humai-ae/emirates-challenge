import { explainPattern, type RankedPattern } from "@hrcc/engine";
import type { FlagResponse, TeamSummary } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PatternFlagsService } from "../src/flags/pattern-flags.service.js";
import { CheckDatasetsService, type LoadedDataset } from "../src/rules/check-datasets.service.js";
import { confirmFormat, EMAILS, runWithFlags } from "./flags-setup.js";
import { createTestApp, signIn, type TestApp } from "./test-app.js";

/** Rows of the pack's dataset of one transaction type. */
function rowsOfType(dataset: LoadedDataset, type: string, count: number): number[] {
  return dataset.prepared.rows
    .filter((row) => row.cells.type === type)
    .slice(0, count)
    .map((row) => row.index);
}

describe("pattern flags", () => {
  let t: TestApp;
  let runId: string;
  let dataset: LoadedDataset;
  let payroll: TeamSummary;
  let service: PatternFlagsService;

  beforeAll(async () => {
    t = await createTestApp();
    const fixture = await runWithFlags(t);
    runId = fixture.runId;
    await confirmFormat(fixture.admin);
    dataset = (await t.app.get(CheckDatasetsService).latest()) as LoadedDataset;
    service = t.app.get(PatternFlagsService);
    const [team]: Array<{ id: string; name_en: string; name_ar: string | null }> =
      await t.dataSource.query(
        "SELECT id, name_en, name_ar FROM teams WHERE name_en = 'Payroll & Compensation'",
      );
    payroll = { id: team?.id ?? "", nameEn: team?.name_en ?? "", nameAr: team?.name_ar ?? null };
  });
  afterAll(async () => {
    await t.close();
  });

  /** A pattern over the given rows, as the ranking gives it. */
  function pattern(rows: number[], subject: string): RankedPattern {
    return {
      detector: "just_under_limit",
      subject,
      strength: 0.66,
      facts: [
        { key: "rule", value: "R-01" },
        { key: "limit", value: 10_000 },
        { key: "requester", value: "E-1001" },
        { key: "near_limit", value: rows.length },
        { key: "of", value: 9 },
        { key: "share_pct", value: 55.6 },
        { key: "everyone_pct", value: 8.1 },
      ],
      rows,
      concern: 0.5,
      combined: 0.58,
      confidence: "Medium",
    };
  }

  const raise = (ranked: RankedPattern[], routing: Record<string, TeamSummary> = {}) =>
    t.dataSource.transaction((manager) =>
      service.raise(manager, { runId, at: new Date(), dataset, routing, ranked, writing: false }),
    );

  it("raises a pattern flag with its facts, people and a standard explanation", async () => {
    const rows = rowsOfType(dataset, "allowance_change", 3);
    const ranked = pattern(rows, "R-01:E-1001");
    const raised = await raise([ranked]);
    expect(raised.newFlags).toBe(1);
    const id = raised.created[0]?.id ?? "";
    const [stored]: Array<Record<string, unknown>> = await t.dataSource.query(
      "SELECT kind, rule_id, result_seq, confidence, severity, severity_reasons, explanation_en, pattern, people, transaction_ids FROM flags WHERE id = $1",
      [id],
    );
    expect(stored).toMatchObject({
      kind: "unusual_pattern",
      rule_id: "PAT-1",
      result_seq: null,
      confidence: "Medium",
      // No rule is broken: Medium confidence makes a Low flag.
      severity: "Low",
      severity_reasons: [{ code: "pattern_confidence", confidence: "Medium" }],
      explanation_en: explainPattern(ranked, "en"),
    });
    expect(stored?.transaction_ids).toHaveLength(3);
    expect(stored?.people).not.toEqual([]);
    const analyst = await signIn(t, EMAILS.analyst);
    const { flag } = (await analyst.get(`/api/v1/flags/${id}`).expect(200)).body as FlagResponse;
    expect(flag.kind).toBe("unusual_pattern");
    expect(flag.pattern).toMatchObject({
      detector: "just_under_limit",
      subject: "R-01:E-1001",
      concern: 0.5,
      combined: 0.58,
    });
    expect(flag.pattern?.transactions.map((item) => item.rowNo)).toEqual(
      rows.map((index) => index + 1),
    );
    expect(flag.pattern?.facts).toContainEqual({ key: "near_limit", value: 3 });
  });

  it("links an unchanged pattern to its open flag", async () => {
    const ranked = pattern(rowsOfType(dataset, "allowance_change", 2), "R-01:E-2002");
    const first = await raise([ranked]);
    const again = await raise([ranked]);
    expect(first.newFlags).toBe(1);
    expect(again).toMatchObject({ newFlags: 0, seenAgain: 1 });
    const [stored]: Array<{ seen_again: unknown[] }> = await t.dataSource.query(
      "SELECT seen_again FROM flags WHERE id = $1",
      [first.created[0]?.id],
    );
    expect(stored?.seen_again).toHaveLength(1);
  });

  it("routes a pattern to the team of its one transaction type, else to no team", async () => {
    const routing = { allowance_change: payroll };
    const same = await raise(
      [pattern(rowsOfType(dataset, "allowance_change", 2), "R-01:E-3003")],
      routing,
    );
    const mixed = await raise(
      [
        pattern(
          [...rowsOfType(dataset, "allowance_change", 1), ...rowsOfType(dataset, "pay_change", 1)],
          "R-01:E-4004",
        ),
      ],
      routing,
    );
    const owners: Array<{ id: string; owner_team_id: string | null }> = await t.dataSource.query(
      "SELECT id, owner_team_id FROM flags WHERE id = ANY($1)",
      [[same.created[0]?.id, mixed.created[0]?.id]],
    );
    const ownerOf = (id: string | undefined) =>
      owners.find((row) => row.id === id)?.owner_team_id ?? null;
    expect(ownerOf(same.created[0]?.id)).toBe(payroll.id);
    expect(ownerOf(mixed.created[0]?.id)).toBeNull();
  });

  it("keeps a pattern out of the export", async () => {
    await raise([pattern(rowsOfType(dataset, "allowance_change", 2), "R-01:E-5005")]);
    const admin = await signIn(t, EMAILS.admin);
    const csv = (await admin.get(`/api/v1/runs/${runId}/export`).expect(200)).text;
    expect(csv).not.toContain("PAT-");
  });
});
