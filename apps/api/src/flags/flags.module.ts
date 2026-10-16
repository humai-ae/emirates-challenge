import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { FlagCreationService } from "./flag-creation.service.js";
import { FlagsController } from "./flags.controller.js";
import { FlagsService } from "./flags.service.js";

@Module({
  imports: [AuditModule],
  controllers: [FlagsController],
  providers: [FlagCreationService, FlagsService],
  exports: [FlagCreationService],
})
export class FlagsModule {}
