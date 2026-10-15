import type { ColumnType, DatasetColumn, DatasetFileKind } from "@hrcc/shared";
import { Column, Entity, PrimaryColumn } from "typeorm";

export type StoredColumnProfile = Pick<
  DatasetColumn,
  | "blankCount"
  | "distinctCount"
  | "invalidCount"
  | "samples"
  | "min"
  | "max"
  | "dateFormat"
  | "dateAmbiguous"
  | "listDelimiter"
>;

@Entity({ name: "dataset_columns" })
export class DatasetColumnEntity {
  @PrimaryColumn({ name: "dataset_id", type: "uuid" })
  datasetId: string;

  @PrimaryColumn({ type: "text" })
  file: DatasetFileKind;

  @PrimaryColumn({ type: "integer" })
  position: number;

  @Column({ type: "text" })
  name: string;

  @Column({ type: "text" })
  type: ColumnType;

  @Column({ type: "text", nullable: true })
  role: string | null;

  @Column({ name: "role_confident", type: "boolean" })
  roleConfident: boolean;

  @Column({ name: "role_confirmed", type: "boolean" })
  roleConfirmed: boolean;

  @Column({ type: "jsonb" })
  profile: StoredColumnProfile;
}
