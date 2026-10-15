import { type InputHTMLAttributes, useId } from "react";
import { cx } from "../lib/cx";

/** A labelled file input. File inputs can't be controlled, so there is no `value`. */
export function FileField({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy =
    [hint ? `${inputId}-hint` : null, error ? `${inputId}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={inputId} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={inputId}
        type="file"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          "rounded-[10px] border bg-white px-3 py-2 text-sm file:me-3 file:rounded-md file:border-0 file:bg-soft file:px-2.5 file:py-1 file:font-semibold",
          error ? "border-high" : "border-control",
        )}
        {...props}
      />
      {hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-high">
          {error}
        </p>
      ) : null}
    </div>
  );
}
