"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, formatDualDate } from "@wbl/ui";
import { AgreementView } from "@wbl/ui/views";
import { donorSignAction } from "./actions";

export function AgreementClient(p: { id: string; agreementRef: string; title: string; issuedAt: string; previewHref: string | null; associationSigned: string | null; donorSigned: string | null; canDonorSign: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  // Riyadh time and both calendars, identical on server and client (an official document date).
  const fmt = (s: string | null) => (s ? formatDualDate(s) : null);
  return <>
    <AgreementView agreementRef={p.agreementRef} title={p.title} issuedAt={p.issuedAt} previewHref={p.previewHref} associationSigned={fmt(p.associationSigned)} donorSigned={fmt(p.donorSigned)}
      canUploadSigned={false} canDonorSign={p.canDonorSign} onUploadSigned={() => {}}
      onDonorSign={async () => { const r = await donorSignAction(p.id); if (r.ok) router.refresh(); else setErr(r.error); }} />
    {err && <Alert tone="danger">{err}</Alert>}
  </>;
}
