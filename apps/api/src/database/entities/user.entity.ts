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

  /** Stored lower-case; the database rejects anything else. */
  @Column({ type: "text", unique: true })
  email: string;

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

  /** `scrypt$N$r$p$salt$key`; null means the account cannot use password sign-in. */
  @Column({ name: "password_hash", type: "text", nullable: true })
  passwordHash: string | null;

  @Column({ name: "must_change_password", type: "boolean", default: false })
  mustChangePassword: boolean;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @Column({ name: "is_demo", type: "boolean", default: false })
  isDemo: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
