import type { ButtonHTMLAttributes } from "react";
import { cx } from "../lib/cx";

type ButtonVariant = "primary" | "secondary" | "danger" | "link";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "border border-primary bg-primary text-white hover:bg-primary-strong",
  secondary: "border border-control bg-white text-ink hover:bg-soft",
  danger: "border border-[#e7b7b2] bg-white text-high hover:bg-high-bg",
  link: "border-0 bg-transparent p-0 text-primary underline underline-offset-4",
};

export function Button({
  variant = "secondary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center gap-2 rounded-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-50",
        variant === "link" ? "" : "px-4 py-2",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
