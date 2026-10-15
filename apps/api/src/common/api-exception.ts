import type { ErrorCode } from "@hrcc/shared";
import { HttpException } from "@nestjs/common";

export class ApiException extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    readonly params: Record<string, unknown> = {},
  ) {
    super({ code, params }, status);
  }
}
