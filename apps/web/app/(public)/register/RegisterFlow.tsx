"use client";
import { useState } from "react";
import { Alert, Button, Card, PageHeader, TextField } from "@wbl/ui";
import { OtpView, RegisterView } from "@wbl/ui/views";
import { completeAction, lookupAction, startOtpAction, verifyOtpAction } from "./actions";

export type RegisterLabels = { title: string; fullName: string; email: string; phone: string; password: string; passwordHint: string; create: string; registered: string };

/** Licence → registry card → code to the official phone → personal account (R-009, R-010, R-012). */
export function RegisterFlow({ labels }: { labels: RegisterLabels }) {
  const [step, setStep] = useState<"lookup" | "otp" | "account" | "done">("lookup");
  const [license, setLicense] = useState("");
  const [otp, setOtp] = useState<{ otpId: string; maskedPhone: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "" });

  if (step === "lookup") return <RegisterView letterHref="/register/letter" onLookup={lookupAction} onConfirm={async (l) => {
    setLicense(l);
    const r = await startOtpAction(l);
    if (r.ok && r.data) { setOtp(r.data); setStep("otp"); } else setError(r.ok ? null : r.error);
  }} />;
  if (step === "otp" && otp) return <OtpView maskedPhone={otp.maskedPhone} onResend={async () => { const r = await startOtpAction(license); if (r.ok && r.data) setOtp(r.data); }}
    onVerify={async (code) => { const r = await verifyOtpAction(otp.otpId, code); if (r.ok) setStep("account"); return r; }} />;
  if (step === "done") return <div className="mx-auto max-w-xl px-4 py-12"><Alert tone="success" title={labels.registered} /><a href="/login" className="mt-4 inline-block text-link underline">{labels.create}</a></div>;
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
      <PageHeader title={labels.title} />
      <Card className="flex flex-col gap-4">
        <TextField label={labels.fullName} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
        <TextField label={labels.email} type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <TextField label={labels.phone} dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
        <TextField label={labels.password} hint={labels.passwordHint} type="password" dir="ltr" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        {error && <Alert tone="danger">{error}</Alert>}
        <Button variant="primary" onClick={async () => {
          const r = await completeAction({ license, otpId: otp?.otpId ?? null, via: "otp", ...form });
          if (r.ok) setStep("done"); else setError(r.error);
        }}>{labels.create}</Button>
      </Card>
    </div>
  );
}
