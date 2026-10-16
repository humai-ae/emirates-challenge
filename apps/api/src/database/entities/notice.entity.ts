import type { NoticeKind } from "@hrcc/shared";
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "notices" })
export class NoticeEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ type: "text" })
  kind: NoticeKind;

  @Column({ type: "jsonb" })
  params: Record<string, string>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @Column({ name: "read_at", type: "timestamptz", nullable: true })
  readAt: Date | null;
}
