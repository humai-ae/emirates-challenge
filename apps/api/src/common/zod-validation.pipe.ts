import type { PipeTransform } from "@nestjs/common";
import type { z } from "zod";
import { ApiException } from "./api-exception.js";

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new ApiException(400, "validation_failed", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        code: issue.code,
        message: issue.message,
      })),
    });
  }
}
