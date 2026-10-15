import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { HealthController } from "./health.controller.js";

@Module({ imports: [AiModule], controllers: [HealthController] })
export class HealthModule {}
