"use client";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../cn";

export type Tab = { id: string; label: string; content: ReactNode };

/** WAI-ARIA tabs. Arrow keys follow reading direction: in RTL, ArrowLeft moves to the NEXT tab. */
export function Tabs({ tabs, initial }: { tabs: Tab[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  const base = useId();
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = tabs.findIndex((t) => t.id === active);
    const rtl = (e.currentTarget.closest("[dir]")?.getAttribute("dir") ?? "rtl") === "rtl";
    const next = rtl ? "ArrowLeft" : "ArrowRight";
    const prev = rtl ? "ArrowRight" : "ArrowLeft";
    let n = idx;
    if (e.key === next) n = (idx + 1) % tabs.length;
    else if (e.key === prev) n = (idx - 1 + tabs.length) % tabs.length;
    else return;
    e.preventDefault();
    setActive(tabs[n]!.id);
    document.getElementById(`${base}-tab-${tabs[n]!.id}`)?.focus();
  };
  return (
    <div>
      <div role="tablist" className="flex gap-1 border-b border-border" onKeyDown={onKey}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`${base}-tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={active === tab.id}
            aria-controls={`${base}-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            className={cn(
              "-mb-px min-h-11 border-b-2 px-4 text-body focus-visible:outline-2 focus-visible:outline-focus",
              active === tab.id ? "border-dark-green font-bold text-text" : "border-transparent text-text-muted hover:text-text",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} id={`${base}-panel-${tab.id}`} role="tabpanel" aria-labelledby={`${base}-tab-${tab.id}`} hidden={active !== tab.id} className="pt-4">
          {tab.content}
        </div>
      ))}
    </div>
  );
}
