import { describe, expect, it } from "vitest";
import { explainFinding } from "./explain.js";

describe("explainFinding", () => {
  it("explains an approver-grade finding in both languages", () => {
    const evidence = [
      { field: "amount", value: "16200", condition: "> 10000" },
      { field: "approvers[].grade", value: ["8", "9"], condition: "none >= 10" },
    ];
    const values = { types: ["allowance_change"], amount_limit: 10000, min_approver_grade: 10 };
    expect(explainFinding("approver_min_grade", evidence, values, "en")).toBe(
      "The amount 16,200 is over 10,000, and no approver is grade 10 or above (approver grades: 8, 9).",
    );
    const arabic = explainFinding("approver_min_grade", evidence, values, "ar");
    expect(arabic).toBe(
      "المبلغ 16,200 أكثر من 10,000، ولا يوجد بين المعتمِدين من درجته 10 أو أعلى (درجات المعتمِدين: 8، 9).",
    );
    expect(arabic).not.toMatch(/[٠-٩]/);
  });

  it("names the missing documents, and what was attached", () => {
    const values = { types: ["exit"], documents: ["resignation_letter", "clearance_form"] };
    const partly = [
      { field: "documents", value: ["resignation_letter"], condition: "missing clearance_form" },
    ];
    expect(explainFinding("documents_present", partly, values, "en")).toBe(
      "Missing: clearance_form. Attached: resignation_letter.",
    );
    const nothing = [
      { field: "documents", value: [], condition: "missing resignation_letter, clearance_form" },
    ];
    expect(explainFinding("documents_present", nothing, values, "en")).toBe(
      "Missing: resignation_letter, clearance_form. Attached: nothing.",
    );
    expect(explainFinding("documents_present", nothing, values, "ar")).toBe(
      "المستندات الناقصة: resignation_letter، clearance_form. المرفقة: لا شيء.",
    );
  });

  it("says how late an approval or a submission was", () => {
    const late = (date: string, days: string) => [
      { field: "approved_at", value: date, condition: "> effective_date + 0 days" },
      { field: "effective_date", value: "2025-02-20", condition: "" },
      { field: "days_after_effective", value: days, condition: "> 0" },
    ];
    expect(
      explainFinding(
        "approved_by_effective",
        late("2025-02-27 11:00", "7"),
        { grace_days: 0 },
        "en",
      ),
    ).toBe("Approved on 2025-02-27 11:00, 7 days after the effective date 2025-02-20.");
    expect(
      explainFinding(
        "approved_by_effective",
        late("2025-02-21 09:00", "1"),
        { grace_days: 0 },
        "en",
      ),
    ).toBe("Approved on 2025-02-21 09:00, 1 day after the effective date 2025-02-20.");
    const submitted = [
      { field: "submitted_at", value: "2025-04-02 09:00", condition: "> effective_date + 30 days" },
      { field: "effective_date", value: "2025-03-02", condition: "" },
      { field: "days_after_effective", value: "31", condition: "> 30" },
    ];
    expect(
      explainFinding("submitted_within_after_effective", submitted, { max_days: 30 }, "en"),
    ).toBe(
      "Submitted on 2025-04-02 09:00, 31 days after the effective date 2025-03-02; the rule allows 30.",
    );
    expect(
      explainFinding("submitted_within_after_effective", submitted, { max_days: 30 }, "ar"),
    ).toBe("قُدِّمت في 2025-04-02 09:00، بعد تاريخ السريان 2025-03-02 (عدد الأيام: 31، المسموح: 30).");
  });

  it("explains a blank field, with the amount when the rule has one", () => {
    const withAmount = [
      { field: "amount", value: "6200", condition: "> 5000" },
      { field: "justification", value: "", condition: "is blank" },
    ];
    expect(
      explainFinding(
        "required_field",
        withAmount,
        { field: "justification", amount_over: 5000 },
        "en",
      ),
    ).toBe("justification is blank on a transaction of 6,200, over 5,000.");
    const blank = [{ field: "justification", value: "", condition: "is blank" }];
    expect(
      explainFinding(
        "text_judgment",
        blank,
        { text_field: "justification", amount_over: null },
        "en",
      ),
    ).toBe("justification is blank.");
    expect(
      explainFinding("required_field", blank, { field: "justification", amount_over: null }, "ar"),
    ).toBe("الحقل justification فارغ.");
  });

  it("explains a comparison and a person who is also an approver", () => {
    expect(
      explainFinding(
        "field_compare",
        [{ field: "amount", value: "6200", condition: "> 5000" }],
        { field: "amount", operator: ">", value: 5000 },
        "en",
      ),
    ).toBe("amount is 6,200, more than 5,000.");
    const requester = [
      { field: "requester_id", value: "E-0007", condition: "== approver_1_id" },
      { field: "approver_1_id", value: "E-0007", condition: "== requester_id" },
    ];
    expect(explainFinding("requester_not_approver", requester, { types: null }, "en")).toBe(
      "The requester E-0007 is also an approver (approver_1_id).",
    );
    expect(explainFinding("requester_not_approver", requester, { types: null }, "ar")).toBe(
      "مقدِّم الطلب E-0007 هو أيضًا أحد المعتمِدين (approver_1_id).",
    );
  });

  it("explains too many transactions in a period", () => {
    const evidence = [
      { field: "employee_id", value: "E-0025", condition: "" },
      { field: "count_in_window", value: "3", condition: "> 2" },
      {
        field: "transactions_in_window",
        value: ["TX-1", "TX-2", "TX-3"],
        condition: "within 365 days",
      },
    ];
    const values = { max_count: 2, window_days: 365 };
    expect(explainFinding("max_count_in_window", evidence, values, "en")).toBe(
      "E-0025 has 3 of these transactions within 365 days; the rule allows 2: TX-1, TX-2, TX-3.",
    );
    expect(explainFinding("max_count_in_window", evidence, values, "ar")).toBe(
      "لدى E-0025 من هذه المعاملات خلال المدة المحددة: 3 (الحد الأقصى: 2، المدة بالأيام: 365): TX-1، TX-2، TX-3.",
    );
  });

  it("quotes numeric IDs as written, without digit grouping", () => {
    const requester = [
      { field: "requester_id", value: "10234", condition: "== approver_1_id" },
      { field: "approver_1_id", value: "10234", condition: "== requester_id" },
    ];
    expect(explainFinding("requester_not_approver", requester, { types: null }, "en")).toBe(
      "The requester 10234 is also an approver (approver_1_id).",
    );
    const subject = [
      { field: "employee_id", value: "100045", condition: "== approver_2_id" },
      { field: "approver_2_id", value: "100045", condition: "== employee_id" },
    ];
    expect(explainFinding("subject_not_approver", subject, { types: null }, "ar")).toBe(
      "الموظف 100045 هو أيضًا أحد معتمِدي معاملته (approver_2_id).",
    );
    const window = [
      { field: "employee_id", value: "2025", condition: "" },
      { field: "count_in_window", value: "3", condition: "> 2" },
      { field: "transactions_in_window", value: ["1001", "1002", "1003"], condition: "" },
    ];
    expect(
      explainFinding("max_count_in_window", window, { max_count: 2, window_days: 30 }, "en"),
    ).toBe("2025 has 3 of these transactions within 30 days; the rule allows 2: 1001, 1002, 1003.");
  });
});

describe("explaining approvals out of order", () => {
  it("names the approval that came too early, and what it came before", () => {
    const evidence = [
      { field: "approver_2_at", value: "2025-02-21 09:00", condition: "< approver_1_at" },
      { field: "approver_1_at", value: "2025-02-21 10:00", condition: "" },
    ];
    expect(explainFinding("approvals_in_order", evidence, { types: null }, "en")).toBe(
      "approver_2_at 2025-02-21 09:00 is before approver_1_at 2025-02-21 10:00.",
    );
    expect(explainFinding("approvals_in_order", evidence, { types: null }, "ar")).toBe(
      "قيمة approver_2_at (2025-02-21 09:00) تسبق قيمة approver_1_at (2025-02-21 10:00).",
    );
  });
});

describe("explaining an approver outside the reporting line", () => {
  it("names the approver, the employee and their reporting line", () => {
    const evidence = [
      { field: "employee_id", value: "E-0004", condition: "" },
      { field: "approver_1_id", value: "E-0006", condition: "not in reporting_line" },
      { field: "reporting_line", value: ["E-0003", "E-0002", "E-0001"], condition: "" },
    ];
    const values = { types: null, approver: "first", reach: "reporting_line" };
    expect(explainFinding("approver_is_manager", evidence, values, "en")).toBe(
      "The first approver E-0006 is not in the reporting line of E-0004 (reporting_line: E-0003, E-0002, E-0001).",
    );
    expect(explainFinding("approver_is_manager", evidence, values, "ar")).toBe(
      "المعتمِد الأول E-0006 ليس ضمن التسلسل الإداري للموظف E-0004 (reporting_line: E-0003، E-0002، E-0001).",
    );
  });
});
