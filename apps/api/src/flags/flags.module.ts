import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { FlagCreationService } from "./flag-creation.service.js";

@Module({
  imports: [AuditModule],
  providers: [FlagCreationService],
  exports: [FlagCreationService],
})
export class FlagsModule {}
