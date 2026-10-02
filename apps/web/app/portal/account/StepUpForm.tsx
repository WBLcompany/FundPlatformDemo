"use client";
import { useActionState, useState, type ReactNode } from "react";
import { Alert, Button, TextField } from "@wbl/ui";

type R = { ok: boolean; error?: string; message?: string; data?: unknown } | null;
/** R-092 / R-070: the sensitive change carries a code sent to the association's official number. */
export function StepUpForm({ label, sendCode, action, children }: { label: string; sendCode: () => Promise<R>; action: (p: R, fd: FormData) => Promise<R>; children: ReactNode }) {
  const [otpId, setOtpId] = useState<string | null>(null);
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3 border-t border-border pt-4">
      {children}
      <Button type="button" onClick={async () => { const r = await sendCode(); if (r?.ok) setOtpId(String(r.data)); }}>{label} — 1</Button>
      {otpId && <><input type="hidden" name="otpId" value={otpId} /><TextField label="#" name="code" inputMode="numeric" dir="ltr" maxLength={6} required /><button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-md bg-action px-4 font-bold text-action-text">{label}</button></>}
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && <Alert tone="success">{state.message}</Alert>}
    </form>
  );
}
