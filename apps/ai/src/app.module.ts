import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ServiceTokenGuard } from "./auth/service-token.guard.js";
import { ConfigModule } from "./config/config.module.js";
import { AI_ENV } from "./config/env.js";
import { DraftingController } from "./drafting/drafting.controller.js";
import { DraftingService } from "./drafting/drafting.service.js";
import { HealthController } from "./health/health.controller.js";
import { TYPESAFE, typesafeClient } from "./providers/typesafe.js";

@Module({
  imports: [ConfigModule],
  controllers: [HealthController, DraftingController],
  providers: [
    { provide: APP_GUARD, useClass: ServiceTokenGuard },
    { provide: TYPESAFE, inject: [AI_ENV], useFactory: typesafeClient },
    DraftingService,
  ],
})
export class AppModule {}
