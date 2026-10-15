import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { DatasetsController } from "./datasets.controller.js";
import { DatasetsService } from "./datasets.service.js";

@Module({
  imports: [AuditModule, StorageModule],
  controllers: [DatasetsController],
  providers: [DatasetsService],
})
export class DatasetsModule {}
