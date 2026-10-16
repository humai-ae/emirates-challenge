import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { RulesModule } from "../rules/rules.module.js";
import { RoutingController } from "./routing.controller.js";
import { RoutingService } from "./routing.service.js";

@Module({
  imports: [AuditModule, AiModule, RulesModule],
  controllers: [RoutingController],
  providers: [RoutingService],
})
export class RoutingModule {}
