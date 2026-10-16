import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ServiceTokenGuard } from "./auth/service-token.guard.js";
import { ConfigModule } from "./config/config.module.js";
import { AI_ENV } from "./config/env.js";
import { DraftingController } from "./drafting/drafting.controller.js";
import { DraftingService } from "./drafting/drafting.service.js";
import { HealthController } from "./health/health.controller.js";
import { FOUNDRY, foundryClient } from "./providers/foundry.js";
import { TYPESAFE, typesafeClient } from "./providers/typesafe.js";
import { RoutingController } from "./routing/routing.controller.js";
import { RoutingService } from "./routing/routing.service.js";
import { RuleActionService } from "./texts/rule-action.service.js";
import { TextsController } from "./texts/texts.controller.js";

@Module({
  imports: [ConfigModule],
  controllers: [HealthController, DraftingController, TextsController, RoutingController],
  providers: [
    { provide: APP_GUARD, useClass: ServiceTokenGuard },
    { provide: TYPESAFE, inject: [AI_ENV], useFactory: typesafeClient },
    { provide: FOUNDRY, inject: [AI_ENV], useFactory: foundryClient },
    DraftingService,
    RuleActionService,
    RoutingService,
  ],
})
export class AppModule {}
