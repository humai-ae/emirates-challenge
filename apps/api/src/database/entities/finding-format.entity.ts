import type { FindingField, FindingFormatValues } from "@hrcc/shared";
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

/** An uploaded finding format: its header, worked examples and the field mapping. */
@Entity({ name: "finding_formats" })
export class FindingFormatEntity {
  @PrimaryColumn({ type: "uuid" })
  id: string;

  @Column({ type: "text" })
  filename: string;

  @Column({ name: "size_bytes", type: "integer" })
  sizeBytes: number;

  @Column({ type: "text" })
  sha256: string;

  @Column({ type: "jsonb" })
  columns: string[];

  @Column({ type: "jsonb" })
  examples: string[][];

  /** The field each column holds, in column order; null leaves it blank. */
  @Column({ type: "jsonb" })
  mapping: Array<FindingField | null>;

  @Column({ name: "value_formats", type: "jsonb" })
  values: FindingFormatValues;

  @Column({ name: "row_version", type: "integer", default: 1 })
  rowVersion: number;

  @Column({ name: "uploaded_by", type: "uuid" })
  uploadedById: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: "uploaded_by" })
  uploadedBy: Relation<UserEntity>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @Column({ name: "confirmed_by", type: "uuid", nullable: true })
  confirmedById: string | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: "confirmed_by" })
  confirmedBy: Relation<UserEntity> | null;

  @Column({ name: "confirmed_at", type: "timestamptz", nullable: true })
  confirmedAt: Date | null;
}
