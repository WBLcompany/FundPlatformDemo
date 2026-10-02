import type { ReactNode } from "react";
import { t } from "../i18n";

export type ActivityItem = { id: string; at: string; atLabel: string; actor: ReactNode; text: ReactNode; ai?: boolean };

/** R-096: a readable timeline of who did what and when, inside every entity page. */
export function ActivityTimeline({ items, title }: { items: ActivityItem[]; title?: string }) {
  return (
    <section aria-label={title ?? t("common.activity")}>
      <h2 className="mb-3 text-h3 font-bold text-text">{title ?? t("common.activity")}</h2>
      {items.length === 0 ? (
        <p className="text-body-sm text-text-muted">{t("common.empty")}</p>
      ) : (
        <ol className="relative flex flex-col gap-4 border-s border-border ps-4">
          {items.map((it) => (
            <li key={it.id} className="relative">
              <span aria-hidden="true" className={`absolute -start-[21px] top-1.5 size-2.5 rounded-sm ${it.ai ? "bg-ai-accent" : "bg-dark-green"}`} />
              <p className="text-body-sm text-text">{it.actor} · {it.text}</p>
              <time dateTime={it.at} className="font-mono text-caption text-text-muted">{it.atLabel}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
