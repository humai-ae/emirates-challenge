import { ApiError } from "@hrcc/shared";
import { createAppI18n } from "@hrcc/ui/app";
import { describe, expect, it } from "vitest";
import { resources } from "../../i18n";
import { explanationOf, flagConflictMessage, formatDay, formatNumber } from "./format";

const i18n = createAppI18n(resources, "en");
const t = i18n.getFixedT("en", "web") as (key: string, options?: Record<string, unknown>) => string;

describe("flag formatting", () => {
  it("writes days and numbers with Latin digits in both languages", () => {
    expect(formatDay("2026-10-19", "en")).toBe("19 Oct 2026");
    expect(formatDay("2026-10-19", "ar")).toMatch(/19/);
    expect(formatNumber(11100, "ar")).toBe("11,100");
  });

  it("explains in the reader's language", () => {
    const flag = { explanationEn: "Too high.", explanationAr: "مرتفع جدًا." };
    expect(explanationOf(flag, "ar")).toBe("مرتفع جدًا.");
    expect(explanationOf(flag, "en")).toBe("Too high.");
  });

  it("says who acted first when a decision comes too late", () => {
    const error = new ApiError(409, {
      code: "flag_changed",
      params: { status: "dismissed", by: "Sara Khan" },
    });
    expect(flagConflictMessage(error, t)).toBe(
      "Already dismissed by Sara Khan. The page now shows where it is.",
    );
    expect(
      flagConflictMessage(new ApiError(400, { code: "flag_owner_required", params: {} }), t),
    ).toBeNull();
  });
});
