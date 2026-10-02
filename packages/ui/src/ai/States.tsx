import type { ReactNode } from "react";
import { Icon } from "../icons";
import { t } from "../i18n";

/** «مانح يجهّز…» — the manual path is offered immediately, never behind the wait. */
export function AiPending({ etaSeconds, onManual }: { etaSeconds?: number; onManual?: () => void }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-3 rounded-md border border-ai-accent bg-surface p-4 text-body-sm text-ai-text">
      <span aria-hidden="true" className="size-3 animate-pulse rounded-sm bg-ai-accent motion-reduce:animate-none" />
      <span className="font-medium">{t("ai.pending")}</span>
      {etaSeconds != null && <span className="text-text-muted">{t("ai.pendingEta", { eta: formatEta(etaSeconds) })}</span>}
      {onManual && <button type="button" onClick={onManual} className="ms-auto text-link underline-offset-4 hover:underline">{t("ai.manualNow")}</button>}
    </div>
  );
}

/** «تعذّر» with the reason and the manual path. No apology (§7). */
export function AiFailed({ reason, onManual, children }: { reason: string; onManual?: () => void; children?: ReactNode }) {
  return (
    <div role="status" className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4 text-body-sm">
      <p className="flex items-center gap-2 font-medium text-text"><Icon name="warning" size={16} />{t("ai.failed")}</p>
      <p className="text-text-muted">{t("ai.failedReason", { reason })}</p>
      {onManual && <button type="button" onClick={onManual} className="self-start text-link underline-offset-4 hover:underline">{t("ai.manualFallback")}</button>}
      {children}
    </div>
  );
}

export function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds} ث`;
  return `${Math.round(seconds / 60)} د`;
}
