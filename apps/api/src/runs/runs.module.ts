import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { FlagsModule } from "../flags/flags.module.js";
import { RulesModule } from "../rules/rules.module.js";
import { FindingFormatsController } from "./finding-formats.controller.js";
import { FindingFormatsService } from "./finding-formats.service.js";
import { RunJudgingService } from "./run-judging.service.js";
import { RunPatternsService } from "./run-patterns.service.js";
import { RunSecondOpinionsService } from "./run-second-opinions.service.js";
import { RunsController } from "./runs.controller.js";
import { RunsService } from "./runs.service.js";

@Module({
  imports: [AuditModule, RulesModule, FlagsModule, AiModule],
  controllers: [RunsController, FindingFormatsController],
  providers: [
    RunsService,
    FindingFormatsService,
    RunJudgingService,
    RunPatternsService,
    RunSecondOpinionsService,
  ],
})
export class RunsModule {}
