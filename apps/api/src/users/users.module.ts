import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { TeamEntity, UserEntity } from "../database/entities/index.js";
import { TeamsController } from "./teams.controller.js";
import { TeamsService } from "./teams.service.js";
import { UsersController } from "./users.controller.js";

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, TeamEntity]), AuditModule, AuthModule],
  controllers: [UsersController, TeamsController],
  providers: [TeamsService],
})
export class UsersModule {}
