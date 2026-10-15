import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiException } from "./api-exception.js";
import { ZodValidationPipe } from "./zod-validation.pipe.js";

describe("ZodValidationPipe", () => {
  const pipe = new ZodValidationPipe(z.strictObject({ locale: z.enum(["en", "ar"]) }));

  it("returns parsed data", () => {
    expect(pipe.transform({ locale: "ar" })).toEqual({ locale: "ar" });
  });

  it("throws a 400 ApiException listing the issues", () => {
    let error: unknown;
    try {
      pipe.transform({ locale: "fr", extra: true });
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(ApiException);
    const apiError = error as ApiException;
    expect(apiError.getStatus()).toBe(400);
    expect(apiError.code).toBe("validation_failed");
    expect(apiError.params.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "locale" })]),
    );
  });
});
