import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, type Relation } from "typeorm";
import { TeamEntity } from "./team.entity.js";
import { UserEntity } from "./user.entity.js";

/** The team that owns findings on one transaction type, as an admin set it. */
@Entity({ name: "routing_rules" })
export class RoutingRuleEntity {
  @PrimaryColumn({ name: "transaction_type", type: "text" })
  transactionType: string;

  @Column({ name: "team_id", type: "uuid" })
  teamId: string;

  @ManyToOne(() => TeamEntity)
  @JoinColumn({ name: "team_id" })
  team: Relation<TeamEntity>;

  @Column({ name: "set_by", type: "uuid" })
  setById: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: "set_by" })
  setBy: Relation<UserEntity>;

  @Column({ name: "set_at", type: "timestamptz" })
  setAt: Date;
}
