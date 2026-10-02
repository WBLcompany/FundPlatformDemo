import { AiBadge } from "./AiBadge";
import { t } from "../i18n";
import type { AiState } from "./types";

export type Brief = { now: string; waiting: string; risk?: string };

/** «الخلاصة الآن» — two lines in the entity header. Failed or disabled: the line is hidden (§2 fallback). */
export function EntityBrief({ state }: { state: AiState<Brief> }) {
  if (state.status === "disabled" || state.status === "failed") return null;
  if (state.status === "pending") {
    return <div aria-busy="true" className="h-12 animate-pulse rounded-md bg-ai-bg/40 motion-reduce:animate-none" />;
  }
  const b = state.value;
  return (
    <aside aria-label={t("ai.brief")} className="flex flex-col gap-1 rounded-md bg-ai-bg/40 px-4 py-3" data-ai-output={state.outputId}>
      <div className="flex items-center gap-2"><AiBadge /><span className="text-caption font-medium text-ai-text">{t("ai.brief")}</span></div>
      <p className="text-body-sm text-text">{b.now}</p>
      <p className="text-body-sm text-text">{b.waiting}{b.risk ? ` · ${b.risk}` : ""}</p>
    </aside>
  );
}
