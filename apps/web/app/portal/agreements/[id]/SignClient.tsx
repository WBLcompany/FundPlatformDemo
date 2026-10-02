"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@wbl/ui";
import { AgreementView } from "@wbl/ui/views";
import { signAction } from "./actions";

export function SignClient(p: { id: string; agreementRef: string; title: string; issuedAt: string; previewHref: string | null; associationSigned: string | null; donorSigned: string | null; canSign: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString("ar-SA-u-nu-latn") : null);
  return <div className="mx-auto max-w-3xl px-4 py-6">
    <AgreementView agreementRef={p.agreementRef} title={p.title} issuedAt={p.issuedAt} previewHref={p.previewHref} associationSigned={fmt(p.associationSigned)} donorSigned={fmt(p.donorSigned)} canUploadSigned={p.canSign} canDonorSign={false}
      onDonorSign={() => {}} onUploadSigned={async (file) => { const fd = new FormData(); fd.set("file", file); const r = await signAction(p.id, fd); if (r.ok) router.refresh(); else setErr(r.error); }} />
    {err && <Alert tone="danger">{err}</Alert>}
  </div>;
}
