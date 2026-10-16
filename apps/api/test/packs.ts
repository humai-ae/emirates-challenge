import { readFileSync } from "node:fs";
import type { ConfirmRolesRequest, DatasetColumn, DatasetDetail } from "@hrcc/shared";
import { CSRF, type signIn } from "./test-app.js";

type Agent = Awaited<ReturnType<typeof signIn>>;

/** A file of the small synthetic pack. */
export const fixture = (name: string): Buffer =>
  readFileSync(new URL(`../../../tools/sample-data/fixtures/small/${name}`, import.meta.url));

/** Uploads the small synthetic pack (300 transactions, 60 employees). */
export async function uploadPack(
  admin: Agent,
  name = "Training pack",
  transactions: Buffer = fixture("transactions.csv"),
): Promise<DatasetDetail> {
  const response = await admin
    .post("/api/v1/datasets")
    .set(CSRF)
    .field("name", name)
    .attach("transactions", transactions, "transactions.csv")
    .attach("employees", fixture("employees.csv"), "employees.csv")
    .expect(201);
  return response.body.dataset;
}

/** The mapping a dataset's columns currently have, minus the roles to leave out. */
export function mappingOf(columns: DatasetColumn[], leaveOut: string[] = []): ConfirmRolesRequest {
  const mapping: ConfirmRolesRequest = { transactions: {}, employees: {} };
  for (const column of columns) {
    if (!column.role || leaveOut.includes(column.role)) continue;
    const roles = mapping[column.file] as Record<string, string[]>;
    roles[column.role] = [...(roles[column.role] ?? []), column.name];
  }
  return mapping;
}
