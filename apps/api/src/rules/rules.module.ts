import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { CheckDatasetsService } from "./check-datasets.service.js";
import { DraftingService } from "./drafting.service.js";
import { RuleRequestsController } from "./rule-requests.controller.js";
import { RulesController } from "./rules.controller.js";
import { RulesService } from "./rules.service.js";

@Module({
  imports: [AuditModule, AiModule],
  controllers: [RulesController, RuleRequestsController],
  providers: [CheckDatasetsService, RulesService, DraftingService],
  exports: [CheckDatasetsService, DraftingService],
})
export class RulesModule {}
