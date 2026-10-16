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

describe("restating the reporting-line check", () => {
  it("restates it for the first or any approver", () => {
    const first = { types: null, approver: "first", reach: "reporting_line" };
    expect(restate("approver_is_manager", first, "en")).toBe(
      "Flags transactions where the first approver isn't the employee's line manager or anyone above them.",
    );
    expect(
      restate("approver_is_manager", { ...first, approver: "any", reach: "line_manager" }, "en"),
    ).toBe("Flags transactions where no approver is the employee's line manager.");
    expect(restate("approver_is_manager", first, "ar")).toBe(
      "يُبلَّغ عن المعاملات عندما لا يكون المعتمِد الأول المديرَ المباشر للموظف ولا أحدًا أعلى منه في التسلسل الإداري.",
    );
  });
});

describe("restating duplicates", () => {
  it("restates duplicates with or without the amount", () => {
    const values = { types: ["pay_change"], window_days: 7, same_amount: "yes" };
    expect(restate("duplicate_transaction", values, "en")).toBe(
      "Flags pay_change transactions when the same employee has an earlier-submitted one of the same type and amount with an effective date within 7 days.",
    );
    expect(restate("duplicate_transaction", { ...values, same_amount: "no" }, "en")).toBe(
      "Flags pay_change transactions when the same employee has an earlier-submitted one of the same type with an effective date within 7 days.",
    );
    expect(restate("duplicate_transaction", values, "ar")).toBe(
      "يُبلَّغ عن المعاملات من نوع pay_change عندما تكون للموظف نفسه معاملة أخرى من النوع نفسه وبالمبلغ نفسه قُدِّمت قبلها، وتاريخ سريانها قريب منها (عدد الأيام: 7).",
    );
  });
});

describe("restating the time since hire", () => {
  it("restates the minimum days after the hire date", () => {
    const values = { types: ["pay_change"], min_days: 180 };
    expect(restate("tenure_minimum", values, "en")).toBe(
      "Flags pay_change transactions that take effect less than 180 days after the employee's hire date.",
    );
    expect(restate("tenure_minimum", values, "ar")).toBe(
      "يُبلَّغ عن المعاملات من نوع pay_change التي تسري قبل مرور المدة المطلوبة على تاريخ تعيين الموظف (الحد الأدنى بالأيام: 180).",
    );
  });
});

describe("restating documents with alternatives", () => {
  it("names the documents all needed and the alternatives", () => {
    const values = {
      types: ["exit"],
      documents: ["clearance_form"],
      any_of: ["resignation_letter", "termination_letter"],
    };
    expect(restate("documents_present", values, "en")).toBe(
      "Flags exit transactions missing any of these documents: clearance_form, or with none of these: resignation_letter, termination_letter.",
    );
    expect(restate("documents_present", values, "ar")).toBe(
      "يُبلَّغ عن المعاملات من نوع exit التي ينقصها أيٌّ من هذه المستندات: clearance_form، أو التي لا يُرفق بها أيٌّ من هذه المستندات: resignation_letter، termination_letter.",
    );
  });
});

describe("restating the employee check with requests", () => {
  it("names the types the employee may not request", () => {
    const values = { types: null, not_requester: ["pay_change", "transfer"] };
    expect(restate("subject_not_approver", values, "en")).toBe(
      "Flags transactions where the employee they are about is also one of the approvers, or is the requester of a pay_change or transfer transaction.",
    );
    expect(restate("subject_not_approver", values, "ar")).toBe(
      "يُبلَّغ عن المعاملات عندما يكون الموظف المعني بها أحد المعتمِدين أيضًا، أو مقدِّمَ الطلب في معاملة من نوع pay_change أو transfer.",
    );
  });
});
