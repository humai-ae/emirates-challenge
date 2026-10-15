import { Column, Entity, PrimaryColumn } from "typeorm";

/** One row of an uploaded transactions file. */
@Entity({ name: "transactions" })
export class TransactionRowEntity {
  @PrimaryColumn({ name: "dataset_id", type: "uuid" })
  datasetId: string;

  /** 1-based, in file order. */
  @PrimaryColumn({ name: "row_no", type: "integer" })
  rowNo: number;

  @Column({ name: "transaction_id", type: "text", nullable: true })
  transactionId: string | null;

  @Column({ type: "text", nullable: true })
  type: string | null;

  @Column({ name: "employee_id", type: "text", nullable: true })
  employeeId: string | null;

  /** `YYYY-MM-DD` (the Dubai calendar date when the file has times). */
  @Column({ name: "effective_date", type: "date", nullable: true })
  effectiveDate: string | null;

  /** Every cell, by the file's own column names. */
  @Column({ type: "jsonb" })
  data: Record<string, string>;
}
