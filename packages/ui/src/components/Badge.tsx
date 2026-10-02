import type { ReactNode } from "react";
import { cn } from "../cn";
import { Icon, type IconName } from "../icons";
import { t } from "../i18n";

export type StatusTone = "done" | "active" | "near" | "late" | "rejected" | "neutral";

// Status is never colour alone: every badge is icon + word (§2.4).
const tones: Record<StatusTone, { cls: string; icon: IconName }> = {
  done: { cls: "bg-success-bg text-text", icon: "check" },
  active: { cls: "bg-info-bg text-text", icon: "history" },
  near: { cls: "bg-warning-bg text-warning-text", icon: "warning" },
  late: { cls: "bg-danger-bg text-danger-text", icon: "error" },
  rejected: { cls: "bg-danger-bg text-danger-text", icon: "close" },
  neutral: { cls: "bg-neutral-100 text-text", icon: "info" },
};

export function StatusBadge({ tone, children }: { tone: StatusTone; children?: ReactNode }) {
  const { cls, icon } = tones[tone];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-caption font-medium", cls)}>
      <Icon name={icon} size={14} />
      {children ?? t(`status.${tone}`)}
    </span>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-caption text-text-muted">
      <span aria-hidden="true" className="inline-block size-2 bg-deep-green" />
      {children}
    </span>
  );
}

/** Reference numbers (application no., framework version, amounts in tables) are Western digits in IBM Plex Mono. */
export function RefNumber({ children, className }: { children: ReactNode; className?: string }) {
  return <span dir="ltr" className={cn("font-mono text-body-sm", className)}>{children}</span>;
}
