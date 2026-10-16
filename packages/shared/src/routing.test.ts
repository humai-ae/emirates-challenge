import { describe, expect, it } from "vitest";
import { SaveRoutingRequestSchema, TeamRequestSchema } from "./index.js";

describe("routing contracts", () => {
  it("refuses the same transaction type twice, whatever its case", () => {
    const result = SaveRoutingRequestSchema.safeParse({
      rows: [
        { type: "PAY_CHANGE", teamName: "Payroll Operations" },
        { type: "pay_change", teamName: null },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ["rows", 1, "type"],
      message: "type_repeated",
    });
  });

  it("needs a team's English name; the Arabic one may be blank", () => {
    expect(
      TeamRequestSchema.safeParse({ nameEn: " Payroll Operations ", nameAr: "" }).data,
    ).toEqual({ nameEn: "Payroll Operations", nameAr: "" });
    expect(TeamRequestSchema.safeParse({ nameEn: " ", nameAr: "" }).error?.issues[0]?.message).toBe(
      "required",
    );
  });
});
