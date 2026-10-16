import { cx } from "@hrcc/ui";
import { useId } from "react";

/** A labelled, multi-line text field with its error, written in the reader's direction. */
export function TextAreaField({
  label,
  value,
  onChange,
  onBlur,
  error,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  placeholder?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        dir="auto"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cx(
          "rounded-[10px] border bg-white px-3 py-2",
          error ? "border-high" : "border-control",
        )}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-high">
          {error}
        </p>
      ) : null}
    </div>
  );
}
