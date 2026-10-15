import type { HTMLAttributes } from "react";
import { cx } from "../lib/cx";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-[14px] border border-line bg-white p-5", className)} {...props} />
  );
}
