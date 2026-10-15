import { Column, Entity, PrimaryColumn } from "typeorm";

/** One row of an uploaded employees file. */
@Entity({ name: "employees" })
export class EmployeeRowEntity {
  @PrimaryColumn({ name: "dataset_id", type: "uuid" })
  datasetId: string;

  @PrimaryColumn({ name: "row_no", type: "integer" })
  rowNo: number;

  @Column({ name: "employee_id", type: "text", nullable: true })
  employeeId: string | null;

  @Column({ type: "jsonb" })
  data: Record<string, string>;
}
