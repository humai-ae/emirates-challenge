import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ServiceTokenGuard } from "./auth/service-token.guard.js";
import { ConfigModule } from "./config/config.module.js";
import { HealthController } from "./health/health.controller.js";

@Module({
  imports: [ConfigModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ServiceTokenGuard }],
})
export class AppModule {}
