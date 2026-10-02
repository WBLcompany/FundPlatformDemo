"use client";
import { Drawer } from "../components/Overlay";
import { Icon } from "../icons";
import { t } from "../i18n";
import type { Evidence } from "./types";

export function EvidenceChip({ evidence, onOpen }: { evidence: Evidence; onOpen: (e: Evidence) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(evidence)}
      className="inline-flex items-center gap-1 rounded-sm border border-ai-accent bg-surface px-2 py-0.5 text-caption text-ai-text hover:bg-ai-bg focus-visible:outline-2 focus-visible:outline-focus"
    >
      <Icon name="evidence" size={14} />
      <span>{evidence.fileName}</span>
      <span className="font-mono">{evidence.page == null ? t("ai.noEvidencePosition") : t("ai.evidencePage", { page: evidence.page })}</span>
    </button>
  );
}

/** Shows the cited excerpt with the cited span highlighted. The excerpt is untrusted data, rendered as text only. */
export function EvidenceDrawer({ evidence, onClose }: { evidence: Evidence | null; onClose: () => void }) {
  const ex = evidence?.excerpt ?? "";
  const span = evidence?.span;
  const parts = span && span.end <= ex.length ? [ex.slice(0, span.start), ex.slice(span.start, span.end), ex.slice(span.end)] : [ex, "", ""];
  return (
    <Drawer open={evidence !== null} onClose={onClose} title={t("ai.evidence")}>
      {evidence && (
        <div className="flex flex-col gap-3">
          <p className="text-body-sm text-text-muted">
            {evidence.fileName} · <span className="font-mono">{evidence.page == null ? t("ai.noEvidencePosition") : t("ai.evidencePage", { page: evidence.page })}</span>
          </p>
          <blockquote className="whitespace-pre-wrap rounded-md border border-border bg-neutral-50 p-4 text-body leading-relaxed text-text">
            {parts[0]}
            {parts[1] && <mark className="bg-ai-bg text-ai-text">{parts[1]}</mark>}
            {parts[2]}
          </blockquote>
        </div>
      )}
    </Drawer>
  );
}
