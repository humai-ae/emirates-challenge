import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ServiceTokenGuard } from "./auth/service-token.guard.js";
import { ConfigModule } from "./config/config.module.js";
import { AI_ENV } from "./config/env.js";
import { DraftingController } from "./drafting/drafting.controller.js";
import { DraftingService } from "./drafting/drafting.service.js";
import { HealthController } from "./health/health.controller.js";
import { JudgmentsController } from "./judgments/judgments.controller.js";
import { JudgmentsService } from "./judgments/judgments.service.js";
import { RestateService } from "./judgments/restate.service.js";
import { TEXT_MODEL_CLIENT, textModelClient } from "./providers/text-model.js";
import { TYPESAFE, typesafeClient } from "./providers/typesafe.js";
import { RoutingController } from "./routing/routing.controller.js";
import { RoutingService } from "./routing/routing.service.js";
import { ExplainService } from "./texts/explain.service.js";
import { RuleActionService } from "./texts/rule-action.service.js";
import { TextsController } from "./texts/texts.controller.js";

@Module({
  imports: [ConfigModule],
  controllers: [
    HealthController,
    DraftingController,
    TextsController,
    RoutingController,
    JudgmentsController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ServiceTokenGuard },
    { provide: TYPESAFE, inject: [AI_ENV], useFactory: typesafeClient },
    { provide: TEXT_MODEL_CLIENT, inject: [AI_ENV], useFactory: textModelClient },
    DraftingService,
    RuleActionService,
    ExplainService,
    RoutingService,
    JudgmentsService,
    RestateService,
  ],
})
export class AppModule {}
