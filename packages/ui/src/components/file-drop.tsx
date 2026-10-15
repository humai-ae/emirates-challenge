import { useId, useState } from "react";
import { cx } from "../lib/cx";

export interface FileDropProps {
  /** The field's name, read by screen readers, e.g. "Transactions file". */
  label: string;
  /** What to do, shown inside the empty zone, e.g. "Drop transactions.csv here, or click to choose it." */
  prompt: string;
  hint?: string;
  error?: string;
  accept?: string;
  name?: string;
  file: File | null;
  onFile: (file: File | null) => void;
  onBlur?: () => void;
  /** The chosen file's size as the reader expects it, e.g. "40.2 kB". */
  formatSize: (bytes: number) => string;
  removeLabel: string;
  className?: string;
}

/**
 * A zone that takes one file, dropped on it or chosen by clicking it. The real file input stays
 * in the page (visually hidden), so keyboards and screen readers use it as usual.
 */
export function FileDrop({
  label,
  prompt,
  hint,
  error,
  accept,
  name,
  file,
  onFile,
  onBlur,
  formatSize,
  removeLabel,
  className,
}: FileDropProps) {
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
    undefined;
  const take = (files: ArrayLike<File> | null | undefined) => onFile(files?.[0] ?? null);
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
              : file
                ? "border-ok bg-ok-bg"
                : "border-control bg-white hover:border-primary",
        )}
      >
        <input
          id={id}
          type="file"
          name={name}
          accept={accept}
          aria-labelledby={`${id}-label`}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className="sr-only"
          onBlur={onBlur}
          onChange={(event) => {
            take(event.target.files);
            // Lets the same file be chosen again after Remove.
            event.target.value = "";
          }}
        />
        {file ? (
          <>
            <span className="font-semibold">
              <bdi>{file.name}</bdi>
            </span>
            <span className="text-sm text-muted">{formatSize(file.size)}</span>
          </>
        ) : (
          <span className="text-muted">{prompt}</span>
        )}
      </label>
      {file ? (
        <button
          type="button"
          className="self-start text-sm font-semibold text-primary hover:underline"
          onClick={() => onFile(null)}
        >
          {removeLabel}
        </button>
      ) : null}
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
