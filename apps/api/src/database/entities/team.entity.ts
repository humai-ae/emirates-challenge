import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "teams" })
export class TeamEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "name_en", type: "text", unique: true })
  nameEn: string;

  @Column({ name: "name_ar", type: "text", nullable: true })
  nameAr: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
