import { SupabaseFileStore } from "../../src/storage/supabase-file-store.js";
import { describeFileStore } from "./file-store-contract.js";

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  throw new Error(
    "Start the local stack and point the API at it first: supabase start && pnpm supabase:env",
  );
}

describeFileStore(
  "Supabase",
  () =>
    new SupabaseFileStore({
      url,
      secretKey,
      bucket: process.env.SUPABASE_STORAGE_BUCKET ?? "datasets",
    }),
);
