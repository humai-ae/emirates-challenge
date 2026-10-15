import { type INestApplication, VersioningType } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { ApiExceptionFilter } from "./common/api-exception.filter.js";

/** Shared by main.ts and the tests so both run the same pipeline. */
export function configureApp(app: INestApplication): void {
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.useGlobalFilters(new ApiExceptionFilter());
}
