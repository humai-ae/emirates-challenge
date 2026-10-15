import { useId, useState } from "react";
import { cx } from "../lib/cx";

export interface FileDropProps {
  /** The field's name, read by screen readers, e.g. "Data files". */
  label: string;
  /** What to do, shown inside the zone, e.g. "Drop the CSV files here, or click to choose them." */
  prompt: string;
  hint?: string;
  error?: string;
  accept?: string;
  multiple?: boolean;
  /** The files dropped or chosen; the caller lists and keeps them. */
  onFiles: (files: File[]) => void;
  className?: string;
}

/**
 * A zone that takes files dropped on it or chosen by clicking it. The real file input stays in
 * the page (visually hidden), so keyboards and screen readers use it as usual.
 */
export function FileDrop({
  label,
  prompt,
  hint,
  error,
  accept,
  multiple,
  onFiles,
  className,
}: FileDropProps) {
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
    undefined;
  const take = (files: ArrayLike<File> | null | undefined) => {
    const list = files ? Array.from(files) : [];
    if (list.length > 0) onFiles(multiple ? list : list.slice(0, 1));
  };
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <span id={`${id}-label`} className="text-sm font-semibold">
        {label}
      </span>
      <label
        htmlFor={id}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          take(event.dataTransfer.files);
        }}
        className={cx(
          "flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-[14px] border-2 border-dashed px-4 py-5 text-center focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary",
          error
            ? "border-high bg-high-bg"
            : dragging
              ? "border-primary bg-soft"
              : "border-control bg-white hover:border-primary",
        )}
      >
        <input
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          aria-labelledby={`${id}-label`}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className="sr-only"
          onChange={(event) => {
            take(event.target.files);
            // Lets the same file be chosen again after it was removed.
            event.target.value = "";
          }}
        />
        <span className="text-muted">{prompt}</span>
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-high">
          {error}
        </p>
      ) : null}
    </div>
  );
}
