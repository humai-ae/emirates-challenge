import type { DataIssue, DatasetStatus, RejectionCode } from "@hrcc/shared";
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";
import { UserEntity } from "./user.entity.js";

@Entity({ name: "datasets" })
export class DatasetEntity {
  /** Chosen by the API before the files are stored, so their Storage paths can use it. */
  @PrimaryColumn({ type: "uuid" })
  id: string;

  @Column({ type: "text" })
  name: string;

  @Column({ type: "text" })
  status: DatasetStatus;

  @Column({ type: "text", nullable: true })
  rejection: RejectionCode | null;

  @Column({ name: "transaction_count", type: "integer" })
  transactionCount: number;

  @Column({ name: "employee_count", type: "integer" })
  employeeCount: number;

  /** `YYYY-MM-DD`. */
  @Column({ name: "period_from", type: "date", nullable: true })
  periodFrom: string | null;

  @Column({ name: "period_to", type: "date", nullable: true })
  periodTo: string | null;

  @Column({ type: "jsonb" })
  issues: DataIssue[];

  /** An admin has confirmed the role of every column. */
  @Column({ name: "columns_confirmed", type: "boolean", default: false })
  columnsConfirmed: boolean;

  @Column({ name: "created_by", type: "uuid" })
  createdById: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: "created_by" })
  createdBy: Relation<UserEntity>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt: Date | null;
}
