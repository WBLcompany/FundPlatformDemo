"use client";
import { useState } from "react";
import { Alert } from "@wbl/ui";
import { DisbursementOrderView } from "@wbl/ui/views";
import type { EntityRefData } from "@wbl/ui/entity";
import { executeAction, returnAction } from "./actions";

export function OrderClient({ id, order, outcome: initial, canAct }: { id: string; canAct: boolean; outcome: "executed" | null; order: { ref: string; association: EntityRefData; project: EntityRefData; amountHalalas: number; installment: string; account: { bank: string; ibanMasked: string; acknowledged: boolean }; blockers: string[] } }) {
  const [outcome, setOutcome] = useState<"executed" | "returned" | null>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [proof, setProof] = useState<File | null>(null);
  return (
    <div className="flex flex-col gap-3" onChange={(e) => { const t = e.target as HTMLInputElement; if (t.type === "file" && t.files?.[0]) setProof(t.files[0]); }}>
      <DisbursementOrderView order={order} outcome={outcome}
        onExecute={async (_name, ref) => {
          if (!canAct || !proof) return;
          const fd = new FormData(); fd.set("proof", proof); fd.set("financeRef", ref);
          const r = await executeAction(id, fd);
          if (r.ok) setOutcome("executed"); else setErr(r.error);
        }}
        onReturn={async (reason) => { if (!canAct) return; const r = await returnAction(id, reason); if (r.ok) setOutcome("returned"); else setErr(r.error); }} />
      {err && <Alert tone="danger">{err}</Alert>}
    </div>
  );
}
