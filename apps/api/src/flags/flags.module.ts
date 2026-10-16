import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { NoticesModule } from "../notices/notices.module.js";
import { CountsController } from "./counts.controller.js";
import { FlagCreationService } from "./flag-creation.service.js";
import { FlagsController } from "./flags.controller.js";
import { FlagsService } from "./flags.service.js";

@Module({
  imports: [AuditModule, NoticesModule, AiModule],
  controllers: [FlagsController, CountsController],
  providers: [FlagCreationService, FlagsService],
  exports: [FlagCreationService],
})
export class FlagsModule {}
