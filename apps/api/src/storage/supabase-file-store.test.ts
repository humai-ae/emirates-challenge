import { describe, expect, it } from "vitest";
import { SupabaseFileStore } from "./supabase-file-store.js";

describe("SupabaseFileStore", () => {
  it("reports an unreachable Storage server as unavailable", async () => {
    // Nothing listens on the discard port, so the connection is refused at once.
    const store = new SupabaseFileStore({
      url: "http://127.0.0.1:9",
      secretKey: "test-secret-key-0123456789",
      bucket: "datasets",
    });
    await expect(store.get("missing.csv")).rejects.toMatchObject({
      name: "FileStoreError",
      failure: "unavailable",
    });
  });
});
