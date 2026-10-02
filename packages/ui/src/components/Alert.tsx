import type { ReactNode } from "react";
import { cn } from "../cn";
import { Icon, type IconName } from "../icons";

export type AlertTone = "info" | "success" | "warning" | "danger";
const tones: Record<AlertTone, { cls: string; icon: IconName }> = {
  info: { cls: "bg-info-bg text-text", icon: "info" },
  success: { cls: "bg-success-bg text-text", icon: "check" },
  warning: { cls: "bg-warning-bg text-warning-text", icon: "warning" },
  danger: { cls: "bg-danger-bg text-danger-text", icon: "error" },
};

export function Alert({ tone = "info", title, children, action }: { tone?: AlertTone; title?: string; children?: ReactNode; action?: ReactNode }) {
  const { cls, icon } = tones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-md p-4", cls)}>
      <Icon name={icon} className="mt-1 shrink-0" />
      <div className="flex-1">
        {title && <p className="text-body font-bold">{title}</p>}
        {children && <div className="text-body-sm">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border bg-surface px-6 py-12 text-center">
      <PixelPattern />
      <p className="text-h3 font-bold text-text">{title}</p>
      {children && <p className="max-w-[56ch] text-body text-text-muted">{children}</p>}
      {action}
    </div>
  );
}

/** The pixel motif — empty states and public programme cards only (§1, §5). */
export function PixelPattern({ className }: { className?: string }) {
  const cells = [0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0];
  return (
    <div aria-hidden="true" className={cn("grid grid-cols-6 gap-1", className)}>
      {cells.map((on, i) => <span key={i} className={cn("size-3", on ? "bg-tech-green" : "bg-light-green/40")} />)}
    </div>
  );
}
