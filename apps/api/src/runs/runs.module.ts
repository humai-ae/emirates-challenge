import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { FlagsModule } from "../flags/flags.module.js";
import { RulesModule } from "../rules/rules.module.js";
import { FindingFormatsController } from "./finding-formats.controller.js";
import { FindingFormatsService } from "./finding-formats.service.js";
import { RunsController } from "./runs.controller.js";
import { RunsService } from "./runs.service.js";

@Module({
  imports: [AuditModule, RulesModule, FlagsModule],
  controllers: [RunsController, FindingFormatsController],
  providers: [RunsService, FindingFormatsService],
})
export class RunsModule {}
