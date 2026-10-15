import { type FileStore, FileStoreError } from "../src/storage/file-store.js";

type Operation = "put" | "get" | "remove";

/** The tests' stand-in for Supabase Storage. It can be told to fail like an unreachable server. */
export class MemoryFileStore implements FileStore {
  private readonly files = new Map<string, Uint8Array>();
  /** Return true to make that call fail with `unavailable`. */
  failWhen: (operation: Operation, path: string) => boolean = () => false;

  async put(path: string, bytes: Uint8Array): Promise<void> {
    this.check("put", path);
    if (this.files.has(path)) throw new FileStoreError("exists", `${path} already exists`);
    this.files.set(path, Uint8Array.from(bytes));
  }

  async get(path: string): Promise<Uint8Array> {
    this.check("get", path);
    const bytes = this.files.get(path);
    if (!bytes) throw new FileStoreError("not_found", `${path} not found`);
    return Uint8Array.from(bytes);
  }

  async remove(paths: readonly string[]): Promise<void> {
    for (const path of paths) this.check("remove", path);
    for (const path of paths) this.files.delete(path);
  }

  /** Every stored path, sorted. */
  paths(): string[] {
    return [...this.files.keys()].sort();
  }

  private check(operation: Operation, path: string): void {
    if (this.failWhen(operation, path)) {
      throw new FileStoreError("unavailable", `${operation} ${path} failed (test)`);
    }
  }
}
