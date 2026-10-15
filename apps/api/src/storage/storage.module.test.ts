import { describe, expect, it } from "vitest";
import { createFileStore } from "./storage.module.js";
import { SupabaseFileStore } from "./supabase-file-store.js";

describe("createFileStore", () => {
  it("refuses to start without the Supabase settings", () => {
    expect(() =>
      createFileStore({
        SUPABASE_URL: undefined,
        SUPABASE_SECRET_KEY: undefined,
        SUPABASE_STORAGE_BUCKET: "datasets",
      }),
    ).toThrow(/SUPABASE_URL and SUPABASE_SECRET_KEY[\s\S]*supabase start/);
    expect(() =>
      createFileStore({
        SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_SECRET_KEY: undefined,
        SUPABASE_STORAGE_BUCKET: "datasets",
      }),
    ).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it("keeps files in the configured Supabase bucket", () => {
    const store = createFileStore({
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SECRET_KEY: "test-secret-key-0123456789",
      SUPABASE_STORAGE_BUCKET: "datasets",
    });
    expect(store).toBeInstanceOf(SupabaseFileStore);
  });
});
