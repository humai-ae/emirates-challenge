import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type FileStore, FileStoreError } from "./file-store.js";

/**
 * Files in a private Supabase Storage bucket. The secret key bypasses row-level security, so it
 * stays on the server; browsers never talk to Storage directly.
 */
export class SupabaseFileStore implements FileStore {
  private readonly client: SupabaseClient;
  private readonly bucketName: string;

  constructor(options: { url: string; secretKey: string; bucket: string }) {
    this.client = createClient(options.url, options.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    this.bucketName = options.bucket;
  }

  private get bucket() {
    return this.client.storage.from(this.bucketName);
  }

  async put(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const { error } = await this.bucket.upload(path, bytes, { contentType, upsert: false });
    if (error) throw failure("put", path, error);
  }

  async get(path: string): Promise<Uint8Array> {
    const { data, error } = await this.bucket.download(path);
    if (error) throw failure("get", path, error);
    return new Uint8Array(await data.arrayBuffer());
  }

  async remove(paths: readonly string[]): Promise<void> {
    if (paths.length === 0) return;
    const { error } = await this.bucket.remove([...paths]);
    if (error) throw failure("remove", paths.join(", "), error);
  }
}

/** Storage puts an HTTP-style status in `statusCode`; network failures have none. */
function failure(operation: string, path: string, error: Error): FileStoreError {
  const status = (error as { statusCode?: unknown }).statusCode;
  const kind = status === "409" ? "exists" : status === "404" ? "not_found" : "unavailable";
  return new FileStoreError(kind, `Storage ${operation} failed for ${path}: ${error.message}`, {
    cause: error,
  });
}
