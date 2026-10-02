"use client";
import { useEffect, useRef, useState } from "react";
import { AiBadge } from "@wbl/ui/ai";

type Hit = { kind: string; label: string; ref?: string; href: string | null; subtitle?: string | null };
type Answer = { kind: "answer"; understood: string; value: number; unit: string; listHref: string } | { kind: "not_understood" } | { kind: "disabled" } | null;

/**
 * N-06 ⌘K / Ctrl+K from any page: search by name or number (R-099), or a question
 * (R-100) when the viewer's role is allowed to ask. Results respect permissions:
 * an item the viewer may not open shows its name without a link.
 */
export type CommandLabels = { open: string; dialog: string; placeholder: string; openList: string; notUnderstood: string; riyal: string };
export function CommandBar({ labels: L }: { labels: CommandLabels }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [answer, setAnswer] = useState<Answer>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); setTimeout(() => input.current?.focus(), 0); }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const id = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (r.ok) setHits(await r.json());
    }, 150);
    return () => clearTimeout(id);
  }, [q]);
  async function ask() {
    const r = await fetch("/api/ask", { method: "POST", body: JSON.stringify({ q }), headers: { "content-type": "application/json" } });
    setAnswer(r.ok ? await r.json() : { kind: "not_understood" });
  }
  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setTimeout(() => input.current?.focus(), 0); }} className="flex min-h-10 w-full max-w-md items-center gap-2 rounded-md border border-border bg-surface px-3 text-body-sm text-text-muted hover:border-dark-green">
        <span className="flex-1 text-start">{L.open}</span><kbd className="font-mono text-caption" dir="ltr">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-deep-green/40 p-4 pt-24" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={L.dialog} className="w-full max-w-2xl rounded-lg bg-surface shadow-float" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={(e) => { e.preventDefault(); void ask(); }} className="border-b border-border p-3">
              <label htmlFor="cmd-q" className="sr-only">{L.open}</label>
              <input id="cmd-q" ref={input} value={q} onChange={(e) => { setQ(e.target.value); setAnswer(null); }} placeholder={L.placeholder} className="w-full bg-transparent px-2 py-2 text-body outline-none" />
            </form>
            <ul className="max-h-96 overflow-y-auto p-2">
              {hits.map((h) => (
                <li key={`${h.kind}-${h.label}-${h.ref}`}>
                  {h.href ? <a href={h.href} className="flex flex-col rounded-md px-3 py-2 hover:bg-neutral-100"><span className="text-body">{h.label} {h.ref && <span dir="ltr" className="font-mono text-caption text-text-muted">{h.ref}</span>}</span>{h.subtitle && <span className="text-caption text-text-muted">{h.subtitle}</span>}</a>
                    : <span className="flex flex-col px-3 py-2"><span className="text-body">{h.label}</span></span>}
                </li>
              ))}
              {answer?.kind === "answer" && (
                <li className="flex flex-col gap-2 rounded-md bg-ai-bg/40 p-3">
                  <span className="flex items-center gap-2 text-caption text-ai-text"><AiBadge />{answer.understood}</span>
                  <span className="font-mono text-h1">{answer.unit === "money" ? `${(answer.value / 100).toLocaleString("en-US")} ${L.riyal}` : answer.value.toLocaleString("en-US")}</span>
                  <a className="text-link underline" href={answer.listHref}>{L.openList}</a>
                </li>
              )}
              {answer?.kind === "not_understood" && <li className="p-3 text-body-sm text-text-muted">{L.notUnderstood}</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
