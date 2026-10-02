import { cn } from "../cn";
import { Icon } from "../icons";
import { t } from "../i18n";

/** Khuzama is the AI's colour and nothing else carries it (D-12). */
export function AiBadge({ source = "manih", className }: { source?: "manih" | "muhassin"; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-sm bg-ai-bg px-2 py-0.5 text-caption font-medium text-ai-text", className)}
      title={t("ai.badgeLabel")}
      data-ai-badge
    >
      <Icon name="ai" size={14} />
      {source === "manih" ? t("ai.badge") : t("ai.badgeMohsen")}
    </span>
  );
}
