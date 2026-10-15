import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module.js";
import { SessionEntity, UserEntity } from "../database/entities/index.js";
import { AuthController } from "./auth.controller.js";
import { CsrfGuard } from "./csrf.guard.js";
import { MeController } from "./me.controller.js";
import { RolesGuard } from "./roles.guard.js";
import { SessionGuard } from "./session.guard.js";
import { SessionService } from "./session.service.js";
import { UsersService } from "./users.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, SessionEntity]), AuditModule],
  controllers: [AuthController, MeController],
  exports: [SessionService],
  providers: [
    SessionService,
    UsersService,
    // Global guards run in registration order.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
