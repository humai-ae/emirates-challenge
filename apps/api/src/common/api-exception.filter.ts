import type { ApiErrorBody, ErrorCode } from "@hrcc/shared";
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { ApiException } from "./api-exception.js";

const CODES_BY_STATUS: Record<number, ErrorCode> = {
  400: "validation_failed",
  401: "unauthenticated",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  413: "file_too_large",
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof ApiException) {
      const body: ApiErrorBody = { code: exception.code, params: exception.params };
      response.status(exception.getStatus()).json(body);
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body: ApiErrorBody = { code: CODES_BY_STATUS[status] ?? "internal_error", params: {} };
      response.status(status).json(body);
      return;
    }
    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    const body: ApiErrorBody = { code: "internal_error", params: {} };
    response.status(500).json(body);
  }
}
