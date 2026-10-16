import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { z } from "zod";

/** Refuses a body its schema doesn't accept, the way `api` does: `{ code, params: { issues } }`. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new BadRequestException({
      code: "validation_failed",
      params: {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          code: issue.code,
          message: issue.message,
        })),
      },
    });
  }
}
