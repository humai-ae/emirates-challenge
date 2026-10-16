import type { Locale, ParameterValue, PresetId } from "@hrcc/shared";

type Values = Readonly<Record<string, ParameterValue>>;

const GROUPED = new Intl.NumberFormat("en-US");

/** Grouped with Latin digits in both languages, as IDs and exports are. */
function number(value: ParameterValue | undefined): string {
  return typeof value === "number" ? GROUPED.format(value) : String(value ?? "");
}

function list(value: ParameterValue | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

function text(value: ParameterValue | undefined): string {
  return typeof value === "string" ? value : "";
}

const COMPARISONS: Record<Locale, Readonly<Record<string, string>>> = {
  en: {
    "==": "exactly",
    "!=": "anything but",
    ">": "more than",
    ">=": "at least",
    "<": "less than",
    "<=": "at most",
  },
  ar: {
    "==": "مساوية لـ",
    "!=": "غير مساوية لـ",
    ">": "أكبر من",
    ">=": "لا تقل عن",
    "<": "أقل من",
    "<=": "لا تزيد على",
  },
};

function typesOf(values: Values, locale: Locale): string {
  const types = list(values.types);
  if (types.length === 0) return locale === "en" ? "transactions" : "المعاملات";
  return locale === "en"
    ? `${types.join(", ")} transactions`
    : `المعاملات من نوع ${types.join("، ")}`;
}

function english(preset: PresetId, values: Values): string {
  const types = typesOf(values, "en");
  const over = values.amount_over == null ? "" : ` over ${number(values.amount_over)}`;
  switch (preset) {
    case "field_compare": {
      const operator = text(values.operator);
      return `Flags ${types} where ${text(values.field)} is ${COMPARISONS.en[operator] ?? operator} ${number(values.value)}.`;
    }
    case "required_field":
      return `Flags ${types}${over} where ${text(values.field)} is blank.`;
    case "approver_min_grade":
      return `Flags ${types} over ${number(values.amount_limit)} where no approver is grade ${number(values.min_approver_grade)} or above.`;
    case "requester_not_approver":
      return `Flags ${types} where the requester is also one of the approvers.`;
    case "subject_not_approver":
      return `Flags ${types} where the employee they are about is also one of the approvers.`;
    case "documents_present":
      return `Flags ${types} missing any of these documents: ${list(values.documents).join(", ")}.`;
    case "approved_by_effective":
      return values.grace_days
        ? `Flags ${types} approved more than ${number(values.grace_days)} days after their effective date.`
        : `Flags ${types} approved after their effective date.`;
    case "submitted_within_after_effective":
      return `Flags ${types} submitted more than ${number(values.max_days)} days after their effective date.`;
    case "approvals_in_order":
      return `Flags ${types} where an approval is dated before the request, or before the approval listed above it.`;
    case "max_count_in_window":
      return `Flags ${types} when the same ${values.per === "requester" ? "requester" : "employee"} has more than ${number(values.max_count)} of them within ${number(values.window_days)} days.`;
    case "text_judgment":
      return `AI reads ${text(values.text_field)} on ${types}${over} and flags it when it doesn't give what the rule asks for. A blank ${text(values.text_field)} is flagged without AI.`;
  }
}

function arabic(preset: PresetId, values: Values): string {
  const types = typesOf(values, "ar");
  const over =
    values.amount_over == null ? "" : ` التي يزيد مبلغها على ${number(values.amount_over)}`;
  switch (preset) {
    case "field_compare": {
      const operator = text(values.operator);
      return `يُبلَّغ عن ${types} عندما تكون قيمة ${text(values.field)} ${COMPARISONS.ar[operator] ?? operator} ${number(values.value)}.`;
    }
    case "required_field":
      return `يُبلَّغ عن ${types}${over} عندما يكون الحقل ${text(values.field)} فارغًا.`;
    case "approver_min_grade":
      return `يُبلَّغ عن ${types} التي يزيد مبلغها على ${number(values.amount_limit)} عندما لا يكون بين المعتمِدين من درجته ${number(values.min_approver_grade)} أو أعلى.`;
    case "requester_not_approver":
      return `يُبلَّغ عن ${types} عندما يكون مقدِّم الطلب أحد المعتمِدين أيضًا.`;
    case "subject_not_approver":
      return `يُبلَّغ عن ${types} عندما يكون الموظف المعني بها أحد المعتمِدين أيضًا.`;
    case "documents_present":
      return `يُبلَّغ عن ${types} التي ينقصها أيٌّ من هذه المستندات: ${list(values.documents).join("، ")}.`;
    case "approved_by_effective":
      return values.grace_days
        ? `يُبلَّغ عن ${types} التي اعتُمدت بعد تاريخ سريانها بمدة تتجاوز المهلة المسموح بها (عدد الأيام: ${number(values.grace_days)}).`
        : `يُبلَّغ عن ${types} التي اعتُمدت بعد تاريخ سريانها.`;
    case "submitted_within_after_effective":
      return `يُبلَّغ عن ${types} التي قُدِّمت بعد تاريخ سريانها بمدة تتجاوز الحد المسموح به (عدد الأيام: ${number(values.max_days)}).`;
    case "approvals_in_order":
      return `يُبلَّغ عن ${types} عندما يسبق تاريخُ أحد الاعتمادات تاريخَ الطلب أو تاريخَ الاعتماد المذكور قبله.`;
    case "max_count_in_window":
      return `يُبلَّغ عن ${types} عندما يتجاوز عددها ${values.per === "requester" ? "لمقدِّم الطلب نفسه" : "للموظف نفسه"} الحد المسموح به (الحد الأقصى: ${number(values.max_count)}، المدة بالأيام: ${number(values.window_days)}).`;
    case "text_judgment":
      return `يقرأ الذكاء الاصطناعي الحقل ${text(values.text_field)} في ${types}${over}، ويُبلِّغ عنه عندما لا يستوفي ما تطلبه القاعدة. ويُبلَّغ عن الحقل الفارغ دون الذكاء الاصطناعي.`;
  }
}

/** What a check does, in one sentence: the restatement shown beside the policy text. */
export function restate(preset: PresetId, values: Values, locale: Locale): string {
  return locale === "en" ? english(preset, values) : arabic(preset, values);
}

const ACTIONS: Record<PresetId, Record<Locale, string>> = {
  field_compare: {
    en: "Check the value against the policy, then correct or reverse the transaction.",
    ar: "قارن القيمة بالسياسة، ثم صحّح المعاملة أو ألغِها.",
  },
  required_field: {
    en: "Ask the requester to fill in the missing information and record it.",
    ar: "اطلب من مقدِّم الطلب استكمال المعلومات الناقصة وتسجيلها.",
  },
  approver_min_grade: {
    en: "Get approval from an approver at the required grade, or reverse the change.",
    ar: "احصل على اعتماد من معتمِد في الدرجة المطلوبة، أو ألغِ التغيير.",
  },
  requester_not_approver: {
    en: "Have someone other than the requester approve the transaction, or reverse it.",
    ar: "اطلب اعتماد المعاملة من شخص غير مقدِّم الطلب، أو ألغِها.",
  },
  subject_not_approver: {
    en: "Have someone other than the employee approve the transaction, or reverse it.",
    ar: "اطلب اعتماد المعاملة من شخص غير الموظف المعني بها، أو ألغِها.",
  },
  documents_present: {
    en: "Attach the missing documents to the record.",
    ar: "أرفق المستندات الناقصة بالسجل.",
  },
  approved_by_effective: {
    en: "Record why the approval came late and check whether anything was paid before it.",
    ar: "سجّل سبب تأخر الاعتماد، وتحقّق مما إذا كان قد صُرف أي مبلغ قبله.",
  },
  submitted_within_after_effective: {
    en: "Record why the transaction was submitted late and check for back pay or overpayment.",
    ar: "سجّل سبب تأخر تقديم المعاملة، وتحقّق من وجود مستحقات بأثر رجعي أو مبالغ مدفوعة بالزيادة.",
  },
  approvals_in_order: {
    en: "Check the approval record for back-entry or a system error, and re-approve if needed.",
    ar: "راجع سجل الاعتماد بحثًا عن إدخال لاحق أو خطأ في النظام، وأعد الاعتماد إذا لزم الأمر.",
  },
  max_count_in_window: {
    en: "Check whether the extra transaction was justified; get sign-off for it or reverse it.",
    ar: "تحقّق مما إذا كانت المعاملة الإضافية مبرَّرة، واحصل على الموافقة عليها أو ألغِها.",
  },
  text_judgment: {
    en: "Ask the requester for a clear written reason and attach it to the record.",
    ar: "اطلب من مقدِّم الطلب سببًا واضحًا مكتوبًا وأرفقه بالسجل.",
  },
};

const GENERAL: Record<Locale, string> = {
  en: "Review the transaction against the policy and correct it.",
  ar: "راجع المعاملة في ضوء السياسة وصحّحها.",
};

/** The suggested fix a new rule starts with, which the admin edits. */
export function suggestedAction(preset: PresetId | null, locale: Locale): string {
  return preset ? ACTIONS[preset][locale] : GENERAL[locale];
}
