import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobQueue } from "../src/jobs/job-queue.service.js";
import { createTestApp, type TestApp } from "./test-app.js";
import { waitFor } from "./wait.js";

describe("background jobs", () => {
  let t: TestApp;
  let jobs: JobQueue;
  beforeAll(async () => {
    // Jobs run once an AI service is set; nothing needs to answer at this address.
    t = await createTestApp({
      AI_SERVICE_URL: "http://127.0.0.1:9",
      AI_SERVICE_TOKEN: "test-ai-token-0123456789",
      JOBS_POLL_SECONDS: "0.5",
    });
    jobs = t.app.get(JobQueue);
  });
  afterAll(async () => {
    await t.close();
  });

  it("runs a job queued in a transaction that commits, and never one whose transaction rolls back", async () => {
    const seen: string[] = [];
    await jobs.register<{ note: string }>("test.note", { retryLimit: 0 }, async (job) => {
      seen.push(job.data.note);
    });
    await t.dataSource.transaction((manager) => jobs.send(manager, "test.note", { note: "kept" }));
    await t.dataSource
      .transaction(async (manager) => {
        await jobs.send(manager, "test.note", { note: "dropped" });
        throw new Error("roll back");
      })
      .catch(() => undefined);
    await waitFor(() => seen.length > 0);
    // Long enough for the worker to have picked up a second job, had there been one.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(seen).toEqual(["kept"]);
  });

  it("keeps the job tables out of Supabase's API roles", async () => {
    await t.dataSource.query(
      "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF; END $$",
    );
    const [row] = await t.dataSource.query(
      "SELECT has_schema_privilege('anon', 'pgboss', 'USAGE') AS usage",
    );
    expect(row.usage).toBe(false);
  });
});
