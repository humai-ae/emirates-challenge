import { Module } from "@nestjs/common";
import { CheckDatasetsService } from "./check-datasets.service.js";

@Module({
  providers: [CheckDatasetsService],
})
export class RulesModule {}
