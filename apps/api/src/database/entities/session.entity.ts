import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, type Relation } from "typeorm";
import { UserEntity } from "./user.entity.js";

/** `id` is the SHA-256 of the cookie token, so a database leak does not leak sessions. */
@Entity({ name: "sessions" })
export class SessionEntity {
  @PrimaryColumn({ type: "text" })
  id: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: Relation<UserEntity>;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt: Date;
}
