import type { Locale, ParameterSpec, ParameterValue, RuleVersion } from "@hrcc/shared";
import { formatCount } from "../data/format";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Translation keys for comparison operators, which can't be keys themselves. */
const OPERATOR_KEYS: Readonly<Record<string, string>> = {
  "==": "eq",
  "!=": "ne",
  ">": "gt",
  ">=": "gte",
  "<": "lt",
  "<=": "lte",
};

export function choiceLabel(parameter: string, choice: string, t: Translate): string {
  const key = parameter === "operator" ? (OPERATOR_KEYS[choice] ?? choice) : choice;
  return t(`rules.choices.${parameter}.${key}`, { defaultValue: choice });
}

export function valuesOf(version: RuleVersion): Record<string, ParameterValue> {
  return Object.fromEntries(
    version.parameters.map((parameter) => [parameter.name, parameter.value]),
  );
}

/** A value as read-only text: lists joined, numbers grouped, choices translated. */
export function formatValue(
  spec: ParameterSpec,
  value: ParameterValue,
  locale: Locale,
  t: Translate,
): string {
  if (value === null) {
    return t(spec.name === "types" ? "rules.form.allTypes" : "rules.form.notSet");
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "number") return formatCount(value, locale);
  return spec.choices ? choiceLabel(spec.name, value, t) : value;
}
