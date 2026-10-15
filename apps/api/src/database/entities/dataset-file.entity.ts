import type { DatasetFileKind } from "@hrcc/shared";
import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "dataset_files" })
export class DatasetFileEntity {
  @PrimaryColumn({ name: "dataset_id", type: "uuid" })
  datasetId: string;

  @PrimaryColumn({ type: "text" })
  kind: DatasetFileKind;

  /** As the uploader named it; shown, never used in a path. */
  @Column({ type: "text" })
  filename: string;

  @Column({ name: "size_bytes", type: "integer" })
  sizeBytes: number;

  /** Kept after deletion, so a file can still be recognised later. */
  @Column({ type: "text" })
  sha256: string;

  /** The object's path in the Storage bucket; null once the dataset is deleted. */
  @Column({ name: "storage_path", type: "text", nullable: true })
  storagePath: string | null;
}
