import type { Evidence, Locale, ParameterValue, PresetId } from "@hrcc/shared";

type Values = Readonly<Record<string, ParameterValue>>;

const GROUPED = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const NUMBER = /^-?\d+(\.\d+)?$/;
const SEPARATORS: Record<Locale, string> = { en: ", ", ar: "، " };

const COMPARISONS: Record<Locale, Readonly<Record<string, string>>> = {
  en: {
    "==": "equal to",
    "!=": "not equal to",
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

function list(value: ParameterValue | Evidence["value"] | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

/** A finding's facts and the rule's values, written for one language. */
function reader(evidence: readonly Evidence[], values: Values, locale: Locale) {
  const separator = SEPARATORS[locale];
  /** An evidence value: numbers grouped with Latin digits, lists joined. */
  const fact = (index: number): string => {
    const value = evidence[index]?.value;
    if (value === undefined) return "";
    if (typeof value !== "string") return value.join(separator);
    return NUMBER.test(value.trim()) ? GROUPED.format(Number(value)) : value;
  };
  const field = (index: number): string => evidence[index]?.field ?? "";
  const param = (name: string): string => {
    const value = values[name];
    if (typeof value === "number") return GROUPED.format(value);
    if (Array.isArray(value)) return value.join(separator);
    return value ?? "";
  };
  // With an amount threshold set, the amount comes first and the blank field last.
  const amountFirst = values.amount_over != null && evidence.length > 1;
  return { separator, fact, field, param, amountFirst, last: evidence.length - 1 };
}

function english(preset: PresetId, evidence: readonly Evidence[], values: Values): string {
  const { fact, field, param, amountFirst, last } = reader(evidence, values, "en");
  const days = (index: number) => `${fact(index)} ${fact(index) === "1" ? "day" : "days"}`;
  const overAmount = amountFirst
    ? ` on a transaction of ${fact(0)}, over ${param("amount_over")}`
    : "";
  switch (preset) {
    case "field_compare": {
      const operator = String(values.operator ?? "");
      return `${field(0)} is ${fact(0)}, ${COMPARISONS.en[operator] ?? operator} ${param("value")}.`;
    }
    case "required_field":
    case "text_judgment":
      return `${field(last)} is blank${overAmount}.`;
    case "approver_min_grade":
      return `The amount ${fact(0)} is over ${param("amount_limit")}, and no approver is grade ${param("min_approver_grade")} or above (approver grades: ${fact(1) || "none on file"}).`;
    case "requester_not_approver":
      return `The requester ${fact(0)} is also an approver (${field(1)}).`;
    case "subject_not_approver":
      return `The employee ${fact(0)} is also an approver of their own transaction (${field(1)}).`;
    case "documents_present": {
      const present = list(evidence[0]?.value);
      const missing = list(values.documents).filter((item) => !present.includes(item));
      return `Missing: ${missing.join(", ")}. Attached: ${present.join(", ") || "nothing"}.`;
    }
    case "approved_by_effective": {
      const grace =
        Number(values.grace_days ?? 0) > 0 ? `; the rule allows ${param("grace_days")}` : "";
      return `Approved on ${fact(0)}, ${days(2)} after the effective date ${fact(1)}${grace}.`;
    }
    case "submitted_within_after_effective":
      return `Submitted on ${fact(0)}, ${days(2)} after the effective date ${fact(1)}; the rule allows ${param("max_days")}.`;
    case "max_count_in_window":
      return `${fact(0)} has ${fact(1)} of these transactions within ${param("window_days")} days; the rule allows ${param("max_count")}: ${fact(2)}.`;
  }
}

function arabic(preset: PresetId, evidence: readonly Evidence[], values: Values): string {
  const { separator, fact, field, param, amountFirst, last } = reader(evidence, values, "ar");
  const overAmount = amountFirst
    ? ` في معاملة مبلغها ${fact(0)}، أي أكثر من ${param("amount_over")}`
    : "";
  switch (preset) {
    case "field_compare": {
      const operator = String(values.operator ?? "");
      return `قيمة ${field(0)} هي ${fact(0)}، وهي ${COMPARISONS.ar[operator] ?? operator} ${param("value")}.`;
    }
    case "required_field":
    case "text_judgment":
      return `الحقل ${field(last)} فارغ${overAmount}.`;
    case "approver_min_grade":
      return `المبلغ ${fact(0)} أكثر من ${param("amount_limit")}، ولا يوجد بين المعتمِدين من درجته ${param("min_approver_grade")} أو أعلى (درجات المعتمِدين: ${fact(1) || "غير مسجلة"}).`;
    case "requester_not_approver":
      return `مقدِّم الطلب ${fact(0)} هو أيضًا أحد المعتمِدين (${field(1)}).`;
    case "subject_not_approver":
      return `الموظف ${fact(0)} هو أيضًا أحد معتمِدي معاملته (${field(1)}).`;
    case "documents_present": {
      const present = list(evidence[0]?.value);
      const missing = list(values.documents).filter((item) => !present.includes(item));
      return `المستندات الناقصة: ${missing.join(separator)}. المرفقة: ${present.join(separator) || "لا شيء"}.`;
    }
    case "approved_by_effective": {
      const grace = Number(values.grace_days ?? 0) > 0 ? `، المسموح: ${param("grace_days")}` : "";
      return `اعتُمدت في ${fact(0)}، بعد تاريخ السريان ${fact(1)} (عدد الأيام: ${fact(2)}${grace}).`;
    }
    case "submitted_within_after_effective":
      return `قُدِّمت في ${fact(0)}، بعد تاريخ السريان ${fact(1)} (عدد الأيام: ${fact(2)}، المسموح: ${param("max_days")}).`;
    case "max_count_in_window":
      return `لدى ${fact(0)} من هذه المعاملات خلال المدة المحددة: ${fact(1)} (الحد الأقصى: ${param("max_count")}، المدة بالأيام: ${param("window_days")}): ${fact(2)}.`;
  }
}

/**
 * Why a transaction was flagged, in one sentence: built from the finding's evidence and the rule's
 * values only, so every number, date and ID in it is one the check saw.
 */
export function explainFinding(
  preset: PresetId,
  evidence: readonly Evidence[],
  values: Values,
  locale: Locale,
): string {
  return locale === "en" ? english(preset, evidence, values) : arabic(preset, evidence, values);
}
