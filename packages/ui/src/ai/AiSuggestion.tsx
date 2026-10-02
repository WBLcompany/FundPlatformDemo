"use client";
import { useState, type ReactNode } from "react";
import { cn } from "../cn";
import { AiBadge } from "./AiBadge";
import { EvidenceChip } from "./Evidence";
import { FeedbackControl } from "./Feedback";
import { AiFailed, AiPending } from "./States";
import { t } from "../i18n";
import type { AiState, Evidence, Feedback } from "./types";

/**
 * One AI suggestion in place (docs/02-ai-layer.md §9). The AI proposes; the
 * person accepts, edits or dismisses. When AI is disabled the slot renders the
 * manual control alone, with no hint that AI exists (§7 «معطّل»).
 */
export function AiSuggestion<T>({
  state,
  render,
  manual,
  editor,
  onAccept,
  onEdit,
  onDismiss,
  onFeedback,
  onEvidence,
  onManual,
  formatOriginal,
}: {
  state: AiState<T>;
  render: (value: T) => ReactNode;
  manual: ReactNode;
  editor?: (value: T, save: (next: T) => void, cancel: () => void) => ReactNode;
  onAccept?: (value: T) => void;
  onEdit?: (next: T) => void;
  onDismiss?: () => void;
  onFeedback?: (f: Feedback) => void;
  onEvidence?: (e: Evidence) => void;
  onManual?: () => void;
  formatOriginal?: (value: T) => string;
}) {
  const [editing, setEditing] = useState(false);
  if (state.status === "disabled") return <>{manual}</>;
  if (state.status === "pending") return <div className="flex flex-col gap-3"><AiPending etaSeconds={state.etaSeconds} onManual={onManual} />{manual}</div>;
  if (state.status === "failed") return <AiFailed reason={state.reason} onManual={onManual}>{manual}</AiFailed>;

  const edited = state.status === "edited";
  return (
    <div className={cn("flex flex-col gap-3 rounded-md border bg-surface p-4", "border-ai-accent")} data-ai-output={state.outputId}>
      <div className="flex flex-wrap items-center gap-2">
        <AiBadge />
        {edited && (
          <span className="text-caption text-text-muted" title={t("ai.originalValue", { value: formatOriginal ? formatOriginal(state.original) : String(state.original) })}>
            {t("ai.edited")}
          </span>
        )}
      </div>
      {editing && editor ? (
        editor(state.value, (next) => { setEditing(false); onEdit?.(next); }, () => setEditing(false))
      ) : (
        <div className="text-body text-text">{render(state.value)}</div>
      )}
      {state.evidence && state.evidence.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-text-muted">{t("ai.source")}</span>
          {state.evidence.map((e, i) => <EvidenceChip key={`${e.fileId}-${i}`} evidence={e} onOpen={(ev) => onEvidence?.(ev)} />)}
        </div>
      )}
      {!editing && (
        <div className="flex flex-wrap items-center gap-2">
          {onAccept && <button type="button" onClick={() => onAccept(state.value)} className="min-h-9 rounded-md border border-deep-green px-3 text-body-sm font-bold text-text hover:bg-neutral-50">{t("ai.accept")}</button>}
          {editor && <button type="button" onClick={() => setEditing(true)} className="min-h-9 rounded-md px-3 text-body-sm text-link hover:underline">{t("ai.edit")}</button>}
          {onDismiss && <button type="button" onClick={onDismiss} className="min-h-9 rounded-md px-3 text-body-sm text-text-muted hover:underline">{t("ai.dismiss")}</button>}
          {onFeedback && <div className="ms-auto"><FeedbackControl onSubmit={onFeedback} /></div>}
        </div>
      )}
    </div>
  );
}
