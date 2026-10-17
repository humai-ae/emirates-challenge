import { Column, Entity, PrimaryColumn } from "typeorm";

/** An AI answer kept by the SHA-256 of what was asked, so the same question isn't asked twice. */
@Entity({ name: "ai_cache" })
export class AiCacheEntity {
  @PrimaryColumn({ type: "text" })
  key: string;

  @Column({ type: "text" })
  kind: "judgment";

  @Column({ type: "jsonb" })
  response: Record<string, unknown>;

  @Column({ name: "created_at", type: "timestamptz", insert: false, update: false })
  createdAt: Date;
}
