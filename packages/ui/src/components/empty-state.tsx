import type { ReactNode } from "react";

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-dashed border-[#c9d0db] bg-white p-9 text-center text-muted">
      <h2 className="mb-2 text-lg font-semibold text-ink">{title}</h2>
      {children ? <div className="mb-4">{children}</div> : null}
      {action}
    </div>
  );
}
