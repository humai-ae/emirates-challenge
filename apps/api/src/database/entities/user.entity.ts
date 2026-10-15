import type { Locale, Role } from "@hrcc/shared";
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";
import { TeamEntity } from "./team.entity.js";

@Entity({ name: "users" })
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "text", unique: true })
  username: string;

  @Column({ name: "display_name", type: "text" })
  displayName: string;

  @Column({ type: "text" })
  role: Role;

  @Column({ type: "text", default: "en" })
  locale: Locale;

  @Column({ name: "team_id", type: "uuid", nullable: true })
  teamId: string | null;

  @ManyToOne(() => TeamEntity, { nullable: true })
  @JoinColumn({ name: "team_id" })
  team: Relation<TeamEntity> | null;

  @Column({ name: "is_demo", type: "boolean", default: true })
  isDemo: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
