import { Module } from "@nestjs/common";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { ConfigModule } from "./config/config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { DatasetsModule } from "./datasets/datasets.module.js";
import { FlagsModule } from "./flags/flags.module.js";
import { HealthModule } from "./health/health.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { RoutingModule } from "./routing/routing.module.js";
import { RulesModule } from "./rules/rules.module.js";
import { RunsModule } from "./runs/runs.module.js";
import { StorageModule } from "./storage/storage.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    JobsModule,
    StorageModule,
    AuditModule,
    AuthModule,
    UsersModule,
    DatasetsModule,
    RulesModule,
    RoutingModule,
    RunsModule,
    FlagsModule,
    HealthModule,
  ],
})
export class AppModule {}
