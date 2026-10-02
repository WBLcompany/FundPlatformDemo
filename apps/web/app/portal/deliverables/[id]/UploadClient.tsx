"use client";
import { useRef, useState } from "react";
import { Alert } from "@wbl/ui";
import { DeliverableUploadView } from "@wbl/ui/views";
import { submitDeliverableAction } from "./actions";

export function UploadClient({ id, projectId, label, dueLabel, done: initial }: { id: string; projectId: string; label: string; dueLabel: string; done: boolean }) {
  const [done, setDone] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const files = useRef<File[]>([]);
  return (
    <div onChange={(e) => { const t = e.target as HTMLInputElement; if (t.type === "file") files.current = Array.from(t.files ?? []); }}>
      <DeliverableUploadView label={label} dueLabel={dueLabel} done={done} onSubmit={async (_names, beneficiaries, spent, note) => {
        const fd = new FormData();
        files.current.forEach((f) => fd.append("files", f));
        fd.set("beneficiaries", String(beneficiaries)); fd.set("spent", String(spent)); fd.set("note", note);
        const r = await submitDeliverableAction(id, fd);
        if (r.ok) setDone(true); else setErr(r.error);
      }} />
      {err && <div className="mx-auto max-w-xl px-4"><Alert tone="danger">{err}</Alert></div>}
      <p className="mx-auto max-w-xl px-4"><a className="text-link underline" href={`/portal/projects/${projectId}`}>←</a></p>
    </div>
  );
}
