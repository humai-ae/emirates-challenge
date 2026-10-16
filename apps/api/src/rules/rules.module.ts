import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { CheckDatasetsService } from "./check-datasets.service.js";
import { RulesController } from "./rules.controller.js";
import { RulesService } from "./rules.service.js";

@Module({
  imports: [AuditModule],
  controllers: [RulesController],
  providers: [CheckDatasetsService, RulesService],
  exports: [CheckDatasetsService],
})
export class RulesModule {}
