"use client";
import { StatusBadge } from "@wbl/ui";
import { AiSuggestion, type AiState } from "@wbl/ui/ai";

export type FinalReview = { notes: string[]; budget_vs_spent: { note: string }; planned_vs_achieved: Array<{ item: string; planned: string; achieved: string; met: boolean }> };

/* Manih's review of the final report (R-072). The render function stays on the client side of the boundary. */
export function ReviewClient({ review, labels }: { review: AiState<FinalReview>; labels: { met: string; notMet: string } }) {
  return (
    <AiSuggestion state={review} manual={null} render={(r) => (
      <ul className="flex flex-col gap-2 text-body-sm">
        {r.planned_vs_achieved.map((x) => (
          <li key={x.item} className="flex flex-wrap items-center gap-2"><span>{x.item}: {x.planned} ← {x.achieved}</span><StatusBadge tone={x.met ? "done" : "late"}>{x.met ? labels.met : labels.notMet}</StatusBadge></li>
        ))}
        <li>{r.budget_vs_spent.note}</li>
        {r.notes.map((n) => <li key={n}>{n}</li>)}
      </ul>
    )} />
  );
}
