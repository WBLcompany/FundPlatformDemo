"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@wbl/ui";
import type { AiState } from "@wbl/ui/ai";
import { InfoRequestView } from "@wbl/ui/views";
import { draftAction, sendInfoAction } from "./actions";

export function InfoClient({ id, appRef, draft, missing }: { id: string; appRef: string; draft: AiState<string>; missing: string[] }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const empty = draft.status === "failed" && /لم يُطلب/.test(draft.reason);
  return (
    <div className="flex flex-col gap-3">
      {empty && <button type="button" className="self-start text-link underline" onClick={async () => { await draftAction(id, missing); router.refresh(); }}>اطلب مسودة من مانح</button>}
      <InfoRequestView appRef={appRef} draft={draft} missing={missing} onSend={async (m, items) => { const r = await sendInfoAction(id, m, items); if (r && !r.ok) setErr(r.error); }} />
      {err && <Alert tone="danger">{err}</Alert>}
    </div>
  );
}
