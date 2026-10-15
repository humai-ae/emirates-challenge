/**
 * Where uploaded files are kept. Paths are relative to the bucket, such as
 * `<dataset id>/transactions.csv`.
 */
export interface FileStore {
  /** Fails with `exists` when something is already stored at `path`. */
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Fails with `not_found` when nothing is stored at `path`. */
  get(path: string): Promise<Uint8Array>;
  /** Paths that hold nothing are skipped, so removing twice succeeds. */
  remove(paths: readonly string[]): Promise<void>;
}

export type FileStoreFailure = "exists" | "not_found" | "unavailable";

export class FileStoreError extends Error {
  constructor(
    readonly failure: FileStoreFailure,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "FileStoreError";
  }
}

/** Injection token for the FileStore. */
export const FILE_STORE = Symbol("FILE_STORE");
