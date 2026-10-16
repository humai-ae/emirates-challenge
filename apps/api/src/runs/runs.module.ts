import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { RulesModule } from "../rules/rules.module.js";
import { RunsController } from "./runs.controller.js";
import { RunsService } from "./runs.service.js";

@Module({
  imports: [AuditModule, RulesModule],
  controllers: [RunsController],
  providers: [RunsService],
})
export class RunsModule {}
