import { PRESET_IDS } from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import { restate, suggestedAction } from "./texts.js";

describe("restate", () => {
  it("restates the approver grade check in both languages", () => {
    const values = { types: ["allowance_change"], amount_limit: 10000, min_approver_grade: 10 };
    expect(restate("approver_min_grade", values, "en")).toBe(
      "Flags allowance_change transactions over 10,000 where no approver is grade 10 or above.",
    );
    const arabic = restate("approver_min_grade", values, "ar");
    expect(arabic).toBe(
      "يُبلَّغ عن المعاملات من نوع allowance_change التي يزيد مبلغها على 10,000 عندما لا يكون بين المعتمِدين من درجته 10 أو أعلى.",
    );
    expect(arabic).not.toMatch(/[٠-٩]/);
  });

  it("says 'transactions' when the rule is about every type", () => {
    expect(restate("requester_not_approver", { types: null }, "en")).toBe(
      "Flags transactions where the requester is also one of the approvers.",
    );
    expect(restate("requester_not_approver", { types: null }, "ar")).toBe(
      "يُبلَّغ عن المعاملات عندما يكون مقدِّم الطلب أحد المعتمِدين أيضًا.",
    );
  });

  it("follows the values: documents, grace days, counts and comparisons", () => {
    expect(
      restate(
        "documents_present",
        { types: ["exit"], documents: ["resignation_letter", "clearance_form"] },
        "en",
      ),
    ).toBe(
      "Flags exit transactions missing any of these documents: resignation_letter, clearance_form.",
    );
    expect(restate("approved_by_effective", { types: ["pay_change"], grace_days: 0 }, "en")).toBe(
      "Flags pay_change transactions approved after their effective date.",
    );
    expect(restate("approved_by_effective", { types: ["pay_change"], grace_days: 3 }, "en")).toBe(
      "Flags pay_change transactions approved more than 3 days after their effective date.",
    );
    expect(
      restate(
        "max_count_in_window",
        { types: ["transfer"], max_count: 5, window_days: 30, per: "requester" },
        "en",
      ),
    ).toBe(
      "Flags transfer transactions when the same requester has more than 5 of them within 30 days.",
    );
    expect(
      restate(
        "field_compare",
        { types: ["overtime"], field: "amount", operator: ">=", value: 4500 },
        "en",
      ),
    ).toBe("Flags overtime transactions where amount is at least 4,500.");
    expect(
      restate("required_field", { types: null, field: "justification", amount_over: null }, "en"),
    ).toBe("Flags transactions where justification is blank.");
  });

  it("describes a judgment rule, with and without an amount", () => {
    expect(
      restate(
        "text_judgment",
        { types: ["pay_change"], text_field: "justification", amount_over: 5000 },
        "en",
      ),
    ).toBe(
      "AI reads justification on pay_change transactions over 5,000 and flags it when it doesn't give what the rule asks for. A blank justification is flagged without AI.",
    );
    expect(
      restate(
        "text_judgment",
        { types: null, text_field: "justification", amount_over: null },
        "ar",
      ),
    ).toBe(
      "يقرأ الذكاء الاصطناعي الحقل justification في المعاملات، ويُبلِّغ عنه عندما لا يستوفي ما تطلبه القاعدة. ويُبلَّغ عن الحقل الفارغ دون الذكاء الاصطناعي.",
    );
  });
});

describe("suggestedAction", () => {
  it("has a suggested fix for every check type in both languages, and a general one", () => {
    for (const id of PRESET_IDS) {
      for (const locale of ["en", "ar"] as const) {
        const action = suggestedAction(id, locale);
        expect(action.length, `${id} ${locale}`).toBeGreaterThan(10);
        expect(action.length, `${id} ${locale}`).toBeLessThanOrEqual(300);
      }
    }
    expect(suggestedAction(null, "en")).toBe(
      "Review the transaction against the policy and correct it.",
    );
    expect(suggestedAction(null, "ar")).toBe("راجع المعاملة في ضوء السياسة وصحّحها.");
  });
});

describe("restating the check types for approval order", () => {
  it("restates approvals in order", () => {
    expect(restate("approvals_in_order", { types: null }, "en")).toBe(
      "Flags transactions where an approval is dated before the request, or before the approval listed above it.",
    );
    expect(restate("approvals_in_order", { types: null }, "ar")).toBe(
      "يُبلَّغ عن المعاملات عندما يسبق تاريخُ أحد الاعتمادات تاريخَ الطلب أو تاريخَ الاعتماد المذكور قبله.",
    );
  });
});
