import { Module } from "@nestjs/common";
import { AiCacheService } from "./ai-cache.service.js";
import { AiClient } from "./ai-client.service.js";

@Module({ providers: [AiClient, AiCacheService], exports: [AiClient, AiCacheService] })
export class AiModule {}
