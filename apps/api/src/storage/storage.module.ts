import { Module } from "@nestjs/common";
import { ENV, type Env } from "../config/env.js";
import { FILE_STORE, type FileStore } from "./file-store.js";
import { SupabaseFileStore } from "./supabase-file-store.js";

export type StorageEnv = Pick<
  Env,
  "SUPABASE_URL" | "SUPABASE_SECRET_KEY" | "SUPABASE_STORAGE_BUCKET"
>;

/** Missing settings stop the API at start-up rather than at the first upload. */
export function createFileStore(env: StorageEnv): FileStore {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error(
      "Set SUPABASE_URL and SUPABASE_SECRET_KEY: uploaded files are kept in Supabase Storage. " +
        "For the local stack, run `supabase start` and then `pnpm supabase:env`.",
    );
  }
  return new SupabaseFileStore({
    url: env.SUPABASE_URL,
    secretKey: env.SUPABASE_SECRET_KEY,
    bucket: env.SUPABASE_STORAGE_BUCKET,
  });
}

@Module({
  providers: [{ provide: FILE_STORE, inject: [ENV], useFactory: createFileStore }],
  exports: [FILE_STORE],
})
export class StorageModule {}
