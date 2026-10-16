import type { ParameterSpec, ParameterValue, RulesDataset } from "@hrcc/shared";
import { cx, Tag } from "@hrcc/ui";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { choiceLabel } from "./rule-format";

const CONTROL = "rounded-[10px] border bg-white px-3 py-2";

/** One value of a check type, with the control its type calls for. */
export function ParameterField({
  spec,
  value,
  onChange,
  dataset,
  edited,
  leastSure,
  problem,
}: {
  spec: ParameterSpec;
  value: ParameterValue;
  onChange: (value: ParameterValue) => void;
  dataset: RulesDataset | null;
  /** An admin changed this value from the draft. */
  edited: boolean;
  /** AI was least sure of this value. */
  leastSure: boolean;
  /** A parameter problem code, from the preview or a refused save. */
  problem: string | null;
}) {
  const { t } = useTranslation("admin");
  const id = useId();
  const label = t(`rules.parameters.${spec.name}`);
  const error = problem ? t(`rules.problems.${problem}`, { defaultValue: problem }) : null;
  const describedBy = error ? `${id}-error` : undefined;
  const mark = (
    <>
      {edited ? <Tag tone="info">{t("rules.form.edited")}</Tag> : null}
      {leastSure ? <Tag tone="ai">{t("rules.form.leastSure")}</Tag> : null}
    </>
  );
  const message = error ? (
    <p id={`${id}-error`} className="text-sm text-high">
      {error}
    </p>
  ) : null;
  const control = cx(CONTROL, error ? "border-high" : "border-control");

  if (spec.type === "string[]") {
    const options =
      spec.vocabulary === "documents"
        ? (dataset?.vocabulary.documents ?? [])
        : (dataset?.vocabulary.types ?? []);
    const chosen = Array.isArray(value) ? value : [];
    // A value the data no longer has stays listed, so it can be unticked.
    const all = [...options, ...chosen.filter((item) => !options.includes(item))];
    const everyType = spec.vocabulary === "types" && spec.optional === true;
    return (
      <fieldset className="flex flex-col gap-2" aria-describedby={describedBy}>
        <legend className="mb-1 text-sm font-semibold">{label}</legend>
        {mark}
        {everyType ? (
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${id}-scope`}
                checked={value === null}
                onChange={() => onChange(null)}
              />
              {t("rules.form.allTypes")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${id}-scope`}
                checked={value !== null}
                onChange={() => onChange(chosen)}
              />
              {t("rules.form.onlyTypes")}
            </label>
          </div>
        ) : null}
        {everyType && value === null ? null : (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {all.map((option) => (
              <label key={option} className="flex items-center gap-2 font-mono text-sm">
                <input
                  type="checkbox"
                  checked={chosen.includes(option)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...chosen, option]
                      : chosen.filter((item) => item !== option);
                    // An optional list with nothing ticked is unset; "only these types" keeps its
                    // empty choice.
                    onChange(next.length === 0 && spec.optional && !everyType ? null : next);
                  }}
                />
                <bdi>{option}</bdi>
              </label>
            ))}
          </div>
        )}
        {message}
      </fieldset>
    );
  }

  const heading = (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {mark}
    </div>
  );
  const text = typeof value === "string" ? value : "";

  if (spec.type === "column") {
    const columns = (dataset?.columns ?? []).filter(
      (column) => !spec.columnTypes || spec.columnTypes.includes(column.type),
    );
    return (
      <div className="flex flex-col gap-1">
        {heading}
        <select
          id={id}
          className={control}
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">{t("rules.form.chooseColumn")}</option>
          {columns.map((column) => (
            <option key={column.name} value={column.name}>
              {column.name}
            </option>
          ))}
          {text && !columns.some((column) => column.name === text) ? (
            <option value={text}>{text}</option>
          ) : null}
        </select>
        {message}
      </div>
    );
  }

  if (spec.type === "string") {
    return (
      <div className="flex flex-col gap-1">
        {heading}
        {spec.choices ? (
          <select
            id={id}
            className={control}
            value={text}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value || null)}
          >
            <option value="">{t("rules.form.choose")}</option>
            {spec.choices.map((choice) => (
              <option key={choice} value={choice}>
                {choiceLabel(spec.name, choice, t)}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            className={control}
            value={text}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value || null)}
          />
        )}
        {message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {heading}
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={spec.type === "integer" ? 1 : "any"}
        min={spec.min}
        className={control}
        value={typeof value === "number" ? value : ""}
        placeholder={spec.optional ? t("rules.form.notSet") : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : Number(event.target.value))
        }
      />
      {message}
    </div>
  );
}
