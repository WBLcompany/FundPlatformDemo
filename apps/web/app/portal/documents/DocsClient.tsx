"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@wbl/ui";
import type { AiState } from "@wbl/ui/ai";
import { DocumentUploadView, type ExtractedDoc } from "@wbl/ui/views";
import { confirmDocAction, uploadDocAction } from "./actions";

export function DocsClient({ types }: { types: Array<{ key: string; label: string }> }) {
  const router = useRouter();
  const [docId, setDocId] = useState<string | null>(null);
  const [ex, setEx] = useState<AiState<ExtractedDoc> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const labelOf = (k: string) => types.find((t) => t.key === k)?.label ?? types[0]!.label;
  const keyOf = (label: string) => types.find((t) => t.label === label)?.key ?? label;
  return (
    <>
      <DocumentUploadView docTypes={types.map((t) => t.label)} extraction={ex}
        onUpload={async (file) => {
          setEx({ status: "pending", etaSeconds: 5 });
          const fd = new FormData(); fd.set("file", file);
          const r = await uploadDocAction(fd);
          if (!r.ok || !r.data) { setEx(null); setMsg({ ok: false, text: r.ok ? "" : r.error }); return; }
          setDocId(r.data.documentId);
          const o = r.data.extraction;
          if (o.status === "ready" && o.output) setEx({ status: "ready", outputId: o.id, value: { type: labelOf(o.output.type), number: o.output.number ?? "", issueDate: o.output.issue_date ?? "", expiryDate: o.output.expiry_date ?? "" } });
          else if (o.status === "disabled") setEx({ status: "disabled" });
          else setEx({ status: "failed", reason: "تعذّر الاستخراج؛ أدخل البيانات يدوياً" });
        }}
        onConfirm={async (v) => {
          if (!docId) return;
          const r = await confirmDocAction(docId, { type: keyOf(v.type), number: v.number || null, issueDate: v.issueDate || null, expiryDate: v.expiryDate || null });
          setMsg(r.ok ? { ok: true, text: "حُفظت الوثيقة" } : { ok: false, text: r.error });
          if (r.ok) { setEx(null); setDocId(null); router.refresh(); }
        }} />
      {msg && <div className="mx-auto max-w-xl px-4"><Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert></div>}
    </>
  );
}
