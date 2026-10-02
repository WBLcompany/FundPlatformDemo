"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@wbl/ui";
import { AgreementView } from "@wbl/ui/views";
import { donorSignAction } from "./actions";

export function AgreementClient(p: { id: string; agreementRef: string; title: string; issuedAt: string; previewHref: string | null; associationSigned: string | null; donorSigned: string | null; canDonorSign: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString("ar-SA-u-nu-latn") : null);
  return <>
    <AgreementView agreementRef={p.agreementRef} title={p.title} issuedAt={p.issuedAt} previewHref={p.previewHref} associationSigned={fmt(p.associationSigned)} donorSigned={fmt(p.donorSigned)}
      canUploadSigned={false} canDonorSign={p.canDonorSign} onUploadSigned={() => {}}
      onDonorSign={async () => { const r = await donorSignAction(p.id); if (r.ok) router.refresh(); else setErr(r.error); }} />
    {err && <Alert tone="danger">{err}</Alert>}
  </>;
}
