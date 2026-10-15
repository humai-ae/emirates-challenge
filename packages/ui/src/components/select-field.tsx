import { type ReactNode, type SelectHTMLAttributes, useId } from "react";
import { cx } from "../lib/cx";

export function SelectField({
  label,
  error,
  className,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={selectId} className="text-sm font-semibold">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${selectId}-error` : undefined}
        className={cx(
          "rounded-[10px] border bg-white px-3 py-2",
          error ? "border-high" : "border-control",
        )}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <p id={`${selectId}-error`} className="text-sm text-high">
          {error}
        </p>
      ) : null}
    </div>
  );
}
