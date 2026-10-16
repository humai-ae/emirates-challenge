import { ApiError, type ErrorCode } from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import { createAppI18n } from "../i18n/create-app-i18n";
import { uiAr } from "../i18n/ui-ar";
import { uiEn } from "../i18n/ui-en";
import { apiErrorMessage, fieldError } from "./messages";

const i18n = createAppI18n({ en: { ui: uiEn }, ar: { ui: uiAr } }, "en");
const t = i18n.t.bind(i18n) as (key: string, options?: Record<string, unknown>) => string;

describe("messages", () => {
  it("translates the first field error, whether a key or a schema issue", () => {
    expect(fieldError([], t)).toBeUndefined();
    expect(fieldError([undefined, "passwords_mismatch"], t)).toBe("The passwords don't match.");
    expect(fieldError([{ message: "password_too_short" }], t)).toBe("Use at least 12 characters.");
  });

  it("falls back to a general message for anything that is not a known key", () => {
    expect(fieldError([{ message: "Invalid input: expected string" }], t)).toBe(
      "Check this field.",
    );
    expect(fieldError([{ message: "no_such_key" }], t)).toBe("Check this field.");
  });

  it("turns API error codes into sentences", () => {
    expect(apiErrorMessage(new ApiError(409, { code: "email_taken", params: {} }), t)).toBe(
      "An account with this email already exists.",
    );
    expect(apiErrorMessage(new ApiError(500, { code: "internal_error", params: {} }), t)).toBe(
      "Something went wrong. Try again.",
    );
    expect(apiErrorMessage(new Error("network"), t)).toBe("Something went wrong. Try again.");
  });

  it("says why AI checks can't be retried", () => {
    const message = (code: ErrorCode) =>
      apiErrorMessage(new ApiError(409, { code, params: {} }), t);
    expect(message("ai_not_set_up")).toBe(
      "AI isn't set up, so these transactions can't be checked by AI yet.",
    );
    expect(message("ai_unavailable")).toBe(
      "The AI service isn't answering. Try again in a few minutes.",
    );
    expect(message("nothing_to_retry")).toBe("There are no AI checks left to retry.");
  });
});
