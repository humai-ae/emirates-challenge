import type { ReactNode } from "react";
import { cx } from "../lib/cx";

export type TagTone = "high" | "medium" | "low" | "ai" | "ok" | "warn" | "info" | "neutral";

const TONES: Record<TagTone, string> = {
  high: "bg-high-bg text-high",
  medium: "bg-medium-bg text-medium",
  low: "bg-low-bg text-low",
  ai: "bg-ai-bg text-ai",
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  info: "bg-info-bg text-info",
  neutral: "bg-soft text-muted",
};

export function Tag({ tone = "neutral", children }: { tone?: TagTone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
