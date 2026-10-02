"use client";
import { useState } from "react";
import { Alert, TextArea } from "@wbl/ui";
import { SubmitRecommendationView } from "@wbl/ui/views";
import { recommendAction } from "./actions";

export function RecommendClient({ id, appRef, suggested, chain, labels }: { labels: { rationale: string }; id: string; appRef: string; suggested: { decision: string; amountHalalas: number }; chain: string[] }) {
  const [rationale, setRationale] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SubmitRecommendationView appRef={appRef} suggested={suggested} nextChain={chain} onSubmit={async (decision, amount) => {
        const r = await recommendAction(id, decision, amount, rationale);
        if (r && !r.ok) setErr(r.error);
      }}>
        <TextArea label={labels.rationale} value={rationale} onChange={(e) => setRationale(e.target.value)} required />
        {err && <Alert tone="danger">{err}</Alert>}
      </SubmitRecommendationView>
    </div>
  );
}
