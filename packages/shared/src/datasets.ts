import { z } from "zod";

export const DATASET_FILE_KINDS = ["transactions", "employees"] as const;
export const DatasetFileKindSchema = z.enum(DATASET_FILE_KINDS);
export type DatasetFileKind = z.infer<typeof DatasetFileKindSchema>;

export const COLUMN_TYPES = [
  "id",
  "category",
  "integer",
  "number",
  "date",
  "datetime",
  "list",
  "text",
  "boolean",
] as const;
export const ColumnTypeSchema = z.enum(COLUMN_TYPES);
export type ColumnType = z.infer<typeof ColumnTypeSchema>;

/** What a column means to the checks. The file's own column names are kept as they are. */
export const TRANSACTION_ROLES = [
  "transaction_id",
  "type",
  "employee_id",
  "requester_id",
  "approver_ids",
  "amount",
  "currency",
  "effective_date",
  "submitted_at",
  "approved_at",
  "documents",
  "grade",
  "department",
  "text",
] as const;
export const EMPLOYEE_ROLES = [
  "employee_id",
  "grade",
  "department",
  "location",
  "manager_id",
  "hire_date",
  "exit_date",
] as const;
export const TransactionRoleSchema = z.enum(TRANSACTION_ROLES);
export const EmployeeRoleSchema = z.enum(EMPLOYEE_ROLES);
export type TransactionRole = z.infer<typeof TransactionRoleSchema>;
export type EmployeeRole = z.infer<typeof EmployeeRoleSchema>;

/** Roles that may span several columns: approver_1_id and approver_2_id, or approver_1_at and approver_2_at. */
export const MULTI_COLUMN_ROLES: readonly string[] = ["approver_ids", "approved_at"];

export const DATASET_STATUSES = ["ready", "rejected", "deleted"] as const;
export const DatasetStatusSchema = z.enum(DATASET_STATUSES);
export type DatasetStatus = z.infer<typeof DatasetStatusSchema>;

export const REJECTION_CODES = ["no_transaction_id", "no_employee_id"] as const;
export const RejectionCodeSchema = z.enum(REJECTION_CODES);
export type RejectionCode = z.infer<typeof RejectionCodeSchema>;

export const DATA_ISSUE_CODES = [
  "wrong_column_count",
  "duplicate_header",
  "duplicate_id",
  "blank_values",
  "unknown_employee",
  "invalid_values",
  "mixed_date_format",
  "ambiguous_date_format",
] as const;
export const DataIssueCodeSchema = z.enum(DATA_ISSUE_CODES);

export const DataIssueSchema = z.object({
  code: DataIssueCodeSchema,
  file: DatasetFileKindSchema,
  column: z.string().nullable(),
  role: z.string().nullable(),
  count: z.number().int().min(0),
  examples: z.array(z.string()).max(5),
});
export type DataIssue = z.infer<typeof DataIssueSchema>;

export const DatasetColumnSchema = z.object({
  file: DatasetFileKindSchema,
  name: z.string(),
  position: z.number().int().min(0),
  type: ColumnTypeSchema,
  role: z.string().nullable(),
  roleConfident: z.boolean(),
  roleConfirmed: z.boolean(),
  blankCount: z.number().int().min(0),
  distinctCount: z.number().int().min(0),
  invalidCount: z.number().int().min(0),
  samples: z.array(z.string()).max(5),
  min: z.union([z.string(), z.number()]).nullable(),
  max: z.union([z.string(), z.number()]).nullable(),
  dateFormat: z.string().nullable(),
  dateAmbiguous: z.boolean(),
  listDelimiter: z.string().nullable(),
});
export type DatasetColumn = z.infer<typeof DatasetColumnSchema>;

export const DatasetFileSchema = z.object({
  kind: DatasetFileKindSchema,
  filename: z.string(),
  sizeBytes: z.number().int().min(0),
  sha256: z.string(),
});
export type DatasetFile = z.infer<typeof DatasetFileSchema>;

export const DatasetSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: DatasetStatusSchema,
  rejection: RejectionCodeSchema.nullable(),
  transactionCount: z.number().int().min(0),
  employeeCount: z.number().int().min(0),
  periodFrom: z.iso.date().nullable(),
  periodTo: z.iso.date().nullable(),
  issueCount: z.number().int().min(0),
  /** An admin has confirmed the role of every column. */
  columnsConfirmed: z.boolean(),
  createdAt: z.iso.datetime(),
  /** Display name of the admin who uploaded it. */
  createdBy: z.string(),
});
export type DatasetSummary = z.infer<typeof DatasetSummarySchema>;

export const DatasetDetailSchema = DatasetSummarySchema.extend({
  files: z.array(DatasetFileSchema),
  columns: z.array(DatasetColumnSchema),
  issues: z.array(DataIssueSchema),
});
export type DatasetDetail = z.infer<typeof DatasetDetailSchema>;

export const DatasetsListResponseSchema = z.object({ datasets: z.array(DatasetSummarySchema) });
export type DatasetsListResponse = z.infer<typeof DatasetsListResponseSchema>;

export const DatasetResponseSchema = z.object({ dataset: DatasetDetailSchema });
export type DatasetResponse = z.infer<typeof DatasetResponseSchema>;

const ColumnNames = z.array(z.string().min(1)).min(1).max(10);

/**
 * The admin's role mapping. Roles left out are intentionally unassigned. Only multi-column
 * roles take several columns, and a column plays one role at most.
 */
export const ConfirmRolesRequestSchema = z
  .strictObject({
    transactions: z.partialRecord(TransactionRoleSchema, ColumnNames),
    employees: z.partialRecord(EmployeeRoleSchema, ColumnNames),
  })
  .superRefine((value, context) => {
    for (const file of DATASET_FILE_KINDS) {
      const used = new Set<string>();
      for (const [role, columns = []] of Object.entries(value[file])) {
        if (columns.length > 1 && !MULTI_COLUMN_ROLES.includes(role)) {
          context.addIssue({ code: "custom", path: [file, role], message: "one_column_only" });
        }
        if (columns.some((column) => used.has(column))) {
          context.addIssue({ code: "custom", path: [file, role], message: "column_reused" });
        }
        for (const column of columns) used.add(column);
      }
    }
  });
export type ConfirmRolesRequest = z.infer<typeof ConfirmRolesRequestSchema>;

/** The text fields of the multipart upload; the files travel as `transactions` and `employees`. */
export const UploadDatasetFieldsSchema = z.strictObject({
  name: z.string().trim().max(120).optional(),
  employeesFromDatasetId: z.uuid().optional(),
});
export type UploadDatasetFields = z.infer<typeof UploadDatasetFieldsSchema>;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
