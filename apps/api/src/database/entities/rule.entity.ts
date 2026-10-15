import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "rules" })
export class RuleEntity {
  /** The policy's own ID ("R-01"), or the next free `R-NN`. */
  @PrimaryColumn({ type: "text" })
  id: string;

  /** The policy's heading for the rule, as written. */
  @Column({ type: "text" })
  title: string;

  /** Raised by every change, so a change made on a stale copy is refused. */
  @Column({ name: "row_version", type: "integer", default: 1 })
  rowVersion: number;

  @Column({ name: "created_by", type: "uuid" })
  createdById: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
