"use client";
import { formatMoney } from "@wbl/ui";
import { AiSuggestion, type AiState } from "@wbl/ui/ai";

export type AmendmentDiff = { changes: string[]; impact: string; policy_violations: string[] };
type Changes = { amountHalalas?: number; deliverables?: Array<{ label: string; dueDate?: string }> };

/* R-057: Manih's reading of the change. Manual path: the requested change itself, stated plainly. */
export function DiffClient({ diff, changes, labels }: { diff: AiState<AmendmentDiff>; changes: Changes; labels: { amount: string; deliverables: string } }) {
  const manual = (
    <ul className="list-disc ps-5 text-body-sm">
      {changes.amountHalalas != null && <li>{labels.amount}: <span className="font-mono">{formatMoney(changes.amountHalalas)}</span></li>}
      {changes.deliverables?.length ? <li>{labels.deliverables}: {changes.deliverables.map((d) => d.label).join("، ")}</li> : null}
    </ul>
  );
  return (
    <AiSuggestion state={diff} manual={manual} render={(v) => (
      <div className="flex flex-col gap-2 text-body-sm">
        <ul className="list-disc ps-5">{v.changes.map((c) => <li key={c}>{c}</li>)}</ul>
        <p>{v.impact}</p>
        {v.policy_violations.length > 0 && <p className="text-danger-text">{v.policy_violations.join("، ")}</p>}
      </div>
    )} />
  );
}
