import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditEventEntity } from "../database/entities/index.js";
import { AuditService } from "./audit.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([AuditEventEntity])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
