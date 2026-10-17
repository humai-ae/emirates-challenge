import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { RulesModule } from "../rules/rules.module.js";
import { SecondOpinionsController } from "./second-opinions.controller.js";
import { SecondOpinionsService } from "./second-opinions.service.js";

@Module({
  imports: [AuditModule, RulesModule],
  controllers: [SecondOpinionsController],
  providers: [SecondOpinionsService],
})
export class SecondOpinionsModule {}
