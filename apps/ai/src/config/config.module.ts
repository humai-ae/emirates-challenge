import { Global, Module } from "@nestjs/common";
import { AI_ENV, loadAiEnv } from "./env.js";

@Global()
@Module({
  providers: [{ provide: AI_ENV, useFactory: () => loadAiEnv() }],
  exports: [AI_ENV],
})
export class ConfigModule {}
