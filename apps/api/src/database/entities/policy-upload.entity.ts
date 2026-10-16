import type { OwnerEntry, PolicyWarning } from "@hrcc/shared";
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

/** A policy document an admin uploaded. Its rules' text is kept in their versions. */
@Entity({ name: "policy_uploads" })
export class PolicyUploadEntity {
  @PrimaryColumn({ type: "uuid" })
  id: string;

  @Column({ type: "text" })
  filename: string;

  @Column({ name: "size_bytes", type: "integer" })
  sizeBytes: number;

  @Column({ type: "text" })
  sha256: string;

  @Column({ name: "rules_found", type: "integer" })
  rulesFound: number;

  @Column({ type: "jsonb" })
  warnings: PolicyWarning[];

  /** Owner teams the policy names, by the data's transaction types; the document isn't kept. */
  @Column({ name: "owner_table", type: "jsonb" })
  ownerTable: OwnerEntry[];

  @Column({ name: "uploaded_by", type: "uuid" })
  uploadedById: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: "uploaded_by" })
  uploadedBy: Relation<UserEntity>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
