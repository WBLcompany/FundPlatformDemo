import type { ReactNode } from "react";
import { Eyebrow, RefNumber, StatusBadge, type StatusTone } from "../components/Badge";
import { EntityBrief, type Brief } from "../ai/EntityBrief";
import type { AiState } from "../ai/types";
import { ActivityTimeline, type ActivityItem } from "./ActivityTimeline";

/**
 * The single entity page structure (R-097): header (kind, title, reference,
 * status), «الخلاصة الآن», facts, a main area, and the activity timeline.
 * Used by the association page (D1) and the project page (P1) alike.
 */
export function EntityPage({
  kind,
  title,
  reference,
  status,
  brief,
  facts,
  actions,
  children,
  activity,
  side,
}: {
  kind: string;
  title: string;
  reference?: string;
  status?: { tone: StatusTone; label: string };
  brief?: AiState<Brief>;
  facts?: Array<{ label: string; value: ReactNode }>;
  actions?: ReactNode;
  children: ReactNode;
  activity: ActivityItem[];
  side?: ReactNode;
}) {
  return (
    <article className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Eyebrow>{kind}</Eyebrow>
          {reference && <RefNumber className="text-text-muted">{reference}</RefNumber>}
          {status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-h1 font-bold text-text">{title}</h1>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        {brief && <EntityBrief state={brief} />}
        {facts && facts.length > 0 && (
          <dl className="grid grid-cols-2 gap-4 rounded-md border border-border bg-surface p-4 md:grid-cols-4">
            {facts.map((f) => (
              <div key={f.label} className="flex flex-col gap-1">
                <dt className="text-caption text-text-muted">{f.label}</dt>
                <dd className="text-body text-text">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </header>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">{children}</div>
        <aside className="flex flex-col gap-6">
          {side}
          <ActivityTimeline items={activity} />
        </aside>
      </div>
    </article>
  );
}
