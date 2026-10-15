import { Module } from "@nestjs/common";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { ConfigModule } from "./config/config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { DatasetsModule } from "./datasets/datasets.module.js";
import { HealthModule } from "./health/health.module.js";
import { StorageModule } from "./storage/storage.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    StorageModule,
    AuditModule,
    AuthModule,
    UsersModule,
    DatasetsModule,
    HealthModule,
  ],
})
export class AppModule {}
