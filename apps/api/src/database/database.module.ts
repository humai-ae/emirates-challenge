import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ENV, type Env } from "../config/env.js";
import { dataSourceOptions } from "./options.js";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => dataSourceOptions(env),
    }),
  ],
})
export class DatabaseModule {}
