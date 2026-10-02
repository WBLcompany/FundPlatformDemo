"use client";
import { t } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, TextField } from "@wbl/ui";
import type { AiState } from "@wbl/ui/ai";
import { CommitteeMinutesView, type ExtractedDecision } from "@wbl/ui/views";
import { confirmAction, uploadMinutesAction } from "./actions";

type Extraction = { status: string; decisions: Array<{ application_ref: string; decision: "approve" | "reject" | "defer"; amount_halalas: number | null; evidence: { file_id: string; page: number | null; span: null; excerpt: string } | null }>; outputId: string; error: string | null } | null;

export function MinutesClient({ meetingId, ready, extraction }: { meetingId: string | null; ready: Array<{ id: string; ref: string; title: string; amount: number }>; extraction: Extraction }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [title, setTitle] = useState("");
  // Manual path (AI off or failed): one row per ready application, the secretary picks the decision.
  const manual: ExtractedDecision[] = ready.map((r) => ({ applicationId: r.id, ref: r.ref, title: r.title, decision: "approve", amountHalalas: r.amount, evidence: null }));
  const state: AiState<ExtractedDecision[]> | null = !meetingId ? null
    : !extraction || extraction.status === "disabled" ? { status: "ready", value: manual, outputId: "manual" }
    : extraction.status === "pending" ? { status: "pending", etaSeconds: 40 }
    : extraction.status === "failed" ? { status: "ready", value: manual, outputId: "manual" }
    : { status: "ready", outputId: extraction.outputId, value: extraction.decisions.flatMap((d): ExtractedDecision[] => { const r = ready.find((x) => x.ref === d.application_ref); return r ? [{ applicationId: r.id, ref: r.ref, title: r.title, decision: d.decision, amountHalalas: d.amount_halalas ?? r.amount, evidence: d.evidence ? { fileId: d.evidence.file_id, fileName: t("committee.minutes"), page: d.evidence.page, span: null, excerpt: d.evidence.excerpt } : null }] : []; }) };
  return (
    <div className="flex flex-col gap-4">
      {!meetingId && <Card><TextField label={t("committee.meetingTitle")} value={title} onChange={(e) => setTitle(e.target.value)} /></Card>}
      <CommitteeMinutesView extraction={state} done={done}
        onUpload={async (file) => {
          const fd = new FormData(); fd.set("file", file); fd.set("title", title); fd.set("ids", JSON.stringify(ready.map((r) => r.id)));
          const r = await uploadMinutesAction(fd);
          if (r.ok && r.data) router.push(`/staff/committee/minutes?meeting=${r.data.meetingId}`); else if (!r.ok) setErr(r.error);
        }}
        onConfirm={async (rows) => {
          if (!meetingId) return;
          const r = await confirmAction(meetingId, rows.map((x) => ({ applicationId: x.applicationId, decision: x.decision, amountHalalas: x.amountHalalas })));
          if (r.ok) setDone(true); else setErr(r.error);
        }} />
      {extraction?.status === "pending" && <Button onClick={() => router.refresh()}>{t("common.refresh")}</Button>}
      {err && <Alert tone="danger">{err}</Alert>}
    </div>
  );
}
