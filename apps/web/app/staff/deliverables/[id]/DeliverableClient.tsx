"use client";
import { useState } from "react";
import { Alert, Card } from "@wbl/ui";
import type { AiState } from "@wbl/ui/ai";
import { DeliverableReviewView, type DeliverableReview } from "@wbl/ui/views";
import { decideDeliverableAction } from "./actions";

export function DeliverableClient({ id, projectId, label, status, review, submission, fileIds }: { id: string; projectId: string; label: string; status: string; review: AiState<DeliverableReview>; submission: { beneficiaries: number; spent_halalas: number; note: string } | null; fileIds: string[] }) {
  const [outcome, setOutcome] = useState<string | null>(status === "accepted" ? "accept" : null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {submission && <Card><p className="text-body-sm">{submission.beneficiaries} · {(submission.spent_halalas / 100).toLocaleString("en-US")} · {submission.note}</p><ul>{fileIds.map((f) => <li key={f}><a className="text-link underline" href={`/api/files/${f}`}>{f.slice(0, 8)}</a></li>)}</ul></Card>}
      {status === "submitted" || outcome ? (
        <DeliverableReviewView label={label} review={review} outcome={outcome} onDecide={async (d, note) => {
          const r = await decideDeliverableAction(id, d === "accept" ? "accepted" : d === "return" ? "returned" : "rejected", note);
          if (r.ok) setOutcome(d); else setErr(r.error);
        }} />
      ) : <Alert tone="info" title={label} />}
      {err && <Alert tone="danger">{err}</Alert>}
      <a className="text-link underline" href={`/staff/projects/${projectId}`}>←</a>
    </div>
  );
}
