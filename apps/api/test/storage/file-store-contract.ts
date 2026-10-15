import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { FileStore } from "../../src/storage/file-store.js";

/** What every FileStore must do. Runs against the in-memory store and against Supabase. */
export function describeFileStore(name: string, create: () => FileStore): void {
  describe(`${name} file store`, () => {
    const store = create();
    const folder = `contract-${randomUUID()}`;
    const path = (file: string) => `${folder}/${file}`;
    afterAll(async () => {
      await store.remove([path("a.csv"), path("b.csv"), path("c.csv")]);
    });

    it("returns exactly the bytes it stored", async () => {
      // A byte-order mark, Arabic text and CRLF line ends must come back unchanged.
      const bytes = new TextEncoder().encode("﻿employee_id,name\r\nE-0001,ليلى حداد\r\n");
      await store.put(path("a.csv"), bytes, "text/csv");
      expect(await store.get(path("a.csv"))).toEqual(bytes);
    });

    it("refuses to overwrite a stored file", async () => {
      const bytes = new TextEncoder().encode("a\n1\n");
      await store.put(path("b.csv"), bytes, "text/csv");
      await expect(store.put(path("b.csv"), bytes, "text/csv")).rejects.toMatchObject({
        failure: "exists",
      });
    });

    it("reports a missing file as not found", async () => {
      await expect(store.get(path("missing.csv"))).rejects.toMatchObject({
        failure: "not_found",
      });
    });

    it("removes files, and removing them again succeeds", async () => {
      await store.put(path("c.csv"), new TextEncoder().encode("a\n"), "text/csv");
      await store.remove([path("c.csv")]);
      await expect(store.get(path("c.csv"))).rejects.toMatchObject({ failure: "not_found" });
      await expect(
        store.remove([path("c.csv"), path("never-stored.csv")]),
      ).resolves.toBeUndefined();
    });
  });
}
