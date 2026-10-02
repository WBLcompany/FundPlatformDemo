"use client";
import { useState } from "react";
import { Alert } from "@wbl/ui";
import { ReassignView, type ApplicationRow } from "@wbl/ui/views";
import { reassignAction } from "./actions";

export function ReassignClient({ applications, recipients }: { applications: ApplicationRow[]; recipients: Array<{ value: string; label: string }> }) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return <>
    <ReassignView applications={applications} recipients={recipients} done={done} onReassign={async (ids, to, reason, handover) => {
      const r = await reassignAction(ids, to || null, reason, handover);
      if (r.ok) setDone(true); else setErr(r.error);
    }} />
    {err && <Alert tone="danger">{err}</Alert>}
  </>;
}
