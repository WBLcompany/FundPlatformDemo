"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, EmptyState, PixelPattern } from "../components/Alert";
import { Eyebrow, RefNumber, StatusBadge, type StatusTone } from "../components/Badge";
import { Button } from "../components/Button";
import { Card, CardTitle, PageHeader } from "../components/Card";
import { TextArea, TextField } from "../components/Field";
import { Table } from "../components/Table";
import { AiSuggestion, type AiState } from "../ai";
import { Icon } from "../icons";
import { formatDate, formatDualDate, formatMoney } from "../format";
import { t } from "../i18n";
import type { ApplicationRow, CheckResult, DocumentVM, ProgramVM, ReadinessItem } from "./types";

const v = (k: string, vars?: Record<string, string | number>) => t(`views.${k}`, vars);

/* J1 — public programme page (N-04) */
export function ProgramPublicView({ program }: { program: ProgramVM }) {
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-8">
      <Card className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex flex-1 flex-col gap-2">
          <Eyebrow>{program.donorName}</Eyebrow>
          <h1 className="text-display font-bold text-text">{program.name}</h1>
          <p className="max-w-[72ch] text-body text-text-muted">{program.description}</p>
          <p className="text-caption text-text-muted">{v("program.version")}: <RefNumber>{program.frameworkVersion}</RefNumber></p>
        </div>
        <PixelPattern className="self-start" />
      </Card>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card><dt className="text-caption text-text-muted">{v("program.cap")}</dt><dd className="font-mono text-h2">{formatMoney(program.capHalalas)}</dd></Card>
        <Card><dt className="text-caption text-text-muted">{v("program.duration")}</dt><dd className="text-h2">{v("program.months", { n: program.durationMonths })}</dd></Card>
        <Card><dt className="text-caption text-text-muted">{v("program.window")}</dt><dd className="text-body">{formatDate(program.opensAt)} — {formatDate(program.closesAt)}</dd></Card>
      </dl>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{v("program.conditions")}</CardTitle>
          <p className="mb-3 text-body-sm text-text-muted">{v("program.eligibleCheck")}</p>
          <ul className="flex flex-col gap-2">
            {program.conditions.map((c) => <li key={c} className="flex gap-2 text-body"><Icon name="check" size={18} className="mt-1 shrink-0 text-dark-green" />{c}</li>)}
          </ul>
        </Card>
        <Card>
          <CardTitle>{v("program.criteria")}</CardTitle>
          <ul className="flex flex-col gap-3">
            {program.criteria.map((c) => (
              <li key={c.name} className="flex flex-col gap-1">
                <div className="flex justify-between text-body"><span>{c.name}</span><span className="font-mono">{c.weight}%</span></div>
                <div className="h-2 rounded-sm bg-chart-track" aria-hidden="true"><div className="h-2 rounded-sm bg-chart-1" style={{ inlineSize: `${c.weight}%` }} /></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card>
        <CardTitle>{v("program.faq")}</CardTitle>
        <div className="flex flex-col divide-y divide-border">
          {program.faq.map((f) => (
            <details key={f.q} className="py-3">
              <summary className="cursor-pointer text-body font-medium">{f.q}</summary>
              <p className="pt-2 text-body text-text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </Card>
      <div className="flex justify-end">
        {program.isOpen && program.applyHref ? (
          <a href={program.applyHref} className="inline-flex min-h-11 items-center rounded-md bg-action px-6 text-body font-bold text-action-text hover:bg-light-green">{v("program.apply")}</a>
        ) : (
          <Alert tone="info" title={v("program.closed")} />
        )}
      </div>
    </div>
  );
}

/* J2 — register by licence (R-009, R-011) */
export type AssociationLookup = { name: string; city: string; maskedPhone: string; maskedEmail: string };
export function RegisterView({ onLookup, onConfirm, letterHref }: {
  onLookup: (license: string) => Promise<AssociationLookup | null>;
  onConfirm: (license: string) => void | Promise<void>;
  letterHref: string;
}) {
  const [license, setLicense] = useState("");
  const [result, setResult] = useState<AssociationLookup | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  async function lookup(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(await onLookup(license.trim()));
    setBusy(false);
  }
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
      <PageHeader title={v("register.title")} description={v("register.intro")} />
      <form onSubmit={lookup} className="flex flex-col gap-4">
        <TextField label={v("register.license")} value={license} onChange={(e) => setLicense(e.target.value)} inputMode="numeric" dir="ltr" required />
        <Button type="submit" variant={result ? "secondary" : "primary"} busy={busy}>{v("register.fetch")}</Button>
      </form>
      {result === null && <Alert tone="danger">{v("register.notFound")}</Alert>}
      {result && (
        <Card>
          <CardTitle>{v("register.confirmTitle")}</CardTitle>
          <dl className="grid grid-cols-2 gap-3 text-body">
            <dt className="text-text-muted">{v("register.name")}</dt><dd>{result.name}</dd>
            <dt className="text-text-muted">{v("register.city")}</dt><dd>{result.city}</dd>
            <dt className="text-text-muted">{v("register.officialPhone")}</dt><dd dir="ltr" className="font-mono">{result.maskedPhone}</dd>
            <dt className="text-text-muted">{v("register.officialEmail")}</dt><dd dir="ltr" className="font-mono">{result.maskedEmail}</dd>
          </dl>
          <div className="mt-4"><Button variant="primary" onClick={() => onConfirm(license.trim())}>{v("register.confirm")}</Button></div>
        </Card>
      )}
      <a href={letterHref} className="text-body-sm text-link underline-offset-4 hover:underline">{v("register.oldNumber")}</a>
    </div>
  );
}

/* J3 — OTP (R-010) */
export function OtpView({ maskedPhone, onVerify, onResend, resendAfterSeconds = 60 }: {
  maskedPhone: string;
  onVerify: (code: string) => Promise<{ ok: boolean; attemptsLeft?: number }>;
  onResend: () => void | Promise<void>;
  resendAfterSeconds?: number;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [left, setLeft] = useState(resendAfterSeconds);
  const [error, setError] = useState<string | null>(null);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  function set(i: number, value: string) {
    const d = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    if (d && i < 5) refs.current[i + 1]?.focus();
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const res = await onVerify(digits.join(""));
    if (!res.ok) setError(v("otp.wrong", { n: res.attemptsLeft ?? 0 }));
  }
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-8">
      <PageHeader title={v("otp.title")} description={v("otp.sentTo", { phone: maskedPhone })} />
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div dir="ltr" className="flex justify-center gap-2">
          {digits.map((d, i) => (
            <input key={i} ref={(el) => { refs.current[i] = el; }} value={d} onChange={(e) => set(i, e.target.value)}
              onPaste={(e) => { const p = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6); if (p.length === 6) { e.preventDefault(); setDigits(p.split("")); } }}
              inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={1} aria-label={v("otp.digit", { n: i + 1 })}
              className="size-12 rounded-sm border border-border text-center font-mono text-h2 focus:outline-2 focus:outline-focus" />
          ))}
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" variant="primary" disabled={digits.some((d) => !d)}>{v("otp.verify")}</Button>
        <Button variant="text" disabled={left > 0} onClick={() => { setLeft(resendAfterSeconds); void onResend(); }}>
          {left > 0 ? v("otp.resendIn", { s: left }) : v("otp.resend")}
        </Button>
      </form>
    </div>
  );
}

/* J4 — association home: readiness, programmes, my applications (R-015, R-016) */
const docTone: Record<DocumentVM["state"], StatusTone> = { valid: "done", near: "near", expired: "late", pending: "neutral" };
export function AssociationHomeView({ associationName, readiness, programs, applications, documents, uploadHref }: {
  associationName: string;
  readiness: ReadinessItem[];
  programs: Array<{ id: string; name: string; closesAt: string; href: string | null }>;
  applications: ApplicationRow[];
  documents: DocumentVM[];
  uploadHref: string;
}) {
  const ready = readiness.every((r) => r.ok);
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-6 pb-24 md:pb-6">
      <PageHeader title={associationName} eyebrow={<Eyebrow>{v("assocHome.title")}</Eyebrow>} />
      <Alert tone={ready ? "success" : "warning"} title={ready ? v("assocHome.ready") : v("assocHome.notReady")}>
        {!ready && (
          <ul className="mt-2 flex flex-col gap-2">
            {readiness.filter((r) => !r.ok).map((r) => (
              <li key={r.key} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.label}:</span> <span>{r.reason}</span>
                {r.actionHref && <a href={r.actionHref} className="font-bold underline">{r.actionLabel}</a>}
              </li>
            ))}
          </ul>
        )}
      </Alert>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{v("assocHome.programs")}</CardTitle>
          <ul className="flex flex-col divide-y divide-border">
            {programs.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                <div><p className="text-body font-medium">{p.name}</p><p className="text-caption text-text-muted">{formatDate(p.closesAt)}</p></div>
                {p.href && <a href={p.href} className="text-body-sm text-link underline-offset-4 hover:underline">{v("program.apply")}</a>}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle action={<a href={uploadHref} className="text-body-sm text-link hover:underline">{v("assocHome.upload")}</a>}>{v("assocHome.documents")}</CardTitle>
          <ul className="flex flex-col divide-y divide-border">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                <div><p className="text-body">{d.type}</p>{d.expiresAt && <p className="text-caption text-text-muted">{v("doc.expires", { date: formatDate(d.expiresAt) })}</p>}</div>
                <StatusBadge tone={docTone[d.state]}>{v(`doc.state.${d.state}`)}</StatusBadge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <section>
        <h2 className="mb-3 text-h2 font-bold">{v("assocHome.myApplications")}</h2>
        {applications.length === 0 ? <EmptyState title={v("assocHome.noApplications")} /> : (
          <Table caption={v("assocHome.myApplications")} rows={applications} rowKey={(r) => r.id} columns={[
            { key: "ref", header: "#", mono: true, cell: (r) => r.href ? <a className="text-link hover:underline" href={r.href}>{r.ref}</a> : r.ref },
            { key: "title", header: v("study.item"), cell: (r) => r.title },
            { key: "stage", header: v("track.stages"), cell: (r) => <StatusBadge tone={r.stageTone}>{r.stage}</StatusBadge> },
            { key: "amount", header: v("study.amount"), mono: true, cell: (r) => formatMoney(r.requestedHalalas, false) },
          ]} />
        )}
      </section>
    </div>
  );
}

/* J5 — upload a document with document.extract (R-013, N-01) */
export type ExtractedDoc = { type: string; number: string; issueDate: string; expiryDate: string };
export function DocumentUploadView({ docTypes, extraction, onUpload, onConfirm }: {
  docTypes: string[];
  extraction: AiState<ExtractedDoc> | null;
  onUpload: (file: File) => void;
  onConfirm: (values: ExtractedDoc) => void | Promise<void>;
}) {
  const ready = extraction && (extraction.status === "ready" || extraction.status === "edited") ? extraction.value : null;
  const [vals, setVals] = useState<ExtractedDoc>({ type: docTypes[0] ?? "", number: "", issueDate: "", expiryDate: "" });
  const [touchedFromAi, setTouched] = useState(false);
  useEffect(() => { if (ready && !touchedFromAi) { setVals(ready); setTouched(true); } }, [ready, touchedFromAi]);
  const form = (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void onConfirm(vals); }}>
      <label className="flex flex-col gap-1 text-caption font-medium">{v("doc.type")}
        <select className="rounded-sm border border-border bg-surface px-3 py-2 text-body" value={vals.type} onChange={(e) => setVals({ ...vals, type: e.target.value })}>
          {docTypes.map((d) => <option key={d}>{d}</option>)}
        </select>
      </label>
      <TextField label={v("doc.number")} dir="ltr" value={vals.number} onChange={(e) => setVals({ ...vals, number: e.target.value })} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label={v("doc.issueDate")} type="date" value={vals.issueDate} onChange={(e) => setVals({ ...vals, issueDate: e.target.value })} />
        <TextField label={v("doc.expiryDate")} type="date" required value={vals.expiryDate} onChange={(e) => setVals({ ...vals, expiryDate: e.target.value })} />
      </div>
      <Button type="submit" variant="primary">{v("doc.confirm")}</Button>
    </form>
  );
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-6 pb-24 md:pb-6">
      <PageHeader title={v("doc.title")} />
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-border bg-surface p-8 text-center hover:border-dark-green">
        <Icon name="upload" size={28} />
        <span className="text-body">{v("doc.drop")}</span>
        <input type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
      </label>
      {extraction === null ? form : (
        <AiSuggestion state={extraction} manual={form}
          render={() => <div className="flex flex-col gap-3"><p className="text-body-sm text-text-muted">{v("doc.suggested")}</p>{form}</div>} />
      )}
    </div>
  );
}

/* J6 — application form with deterministic eligibility preview (R-019, R-022, N-02, N-03) */
export type FormFieldVM = { key: string; label: string; kind: "text" | "textarea" | "number"; required: boolean; step: number; hint?: string };
export function ApplicationFormView({ programName, fields, values, prefilled, steps, checks, savedLabel, onChange, onSubmit, onUsePrepared, prefill, submittedRef }: {
  programName: string;
  fields: FormFieldVM[];
  values: Record<string, string>;
  prefilled: string[];
  steps: string[];
  checks: CheckResult[];
  savedLabel: string | null;
  onChange: (key: string, value: string) => void;
  onSubmit: () => void | Promise<void>;
  onUsePrepared?: (file: File) => void;
  prefill?: AiState<Record<string, string>> | null;
  submittedRef?: string | null;
}) {
  const [step, setStep] = useState(1);
  const total = steps.length;
  const required = fields.filter((f) => f.required);
  const done = required.filter((f) => (values[f.key] ?? "").trim() !== "").length;
  const complete = done === required.length;
  const blocking = checks.filter((c) => !c.passed);
  if (submittedRef) {
    return <div className="mx-auto max-w-xl px-4 py-12"><Alert tone="success" title={v("apply.submitted", { ref: submittedRef })} /></div>;
  }
  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-6 px-4 py-6 pb-24 md:pb-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        <PageHeader title={v("apply.title")} eyebrow={<Eyebrow>{programName}</Eyebrow>}
          description={savedLabel ? v("apply.autosaved", { time: savedLabel }) : undefined} />
        {onUsePrepared && (
          <Card className="flex flex-col gap-2 border-ai-accent">
            <p className="text-body font-bold">{v("apply.usePrepared")}</p>
            <p className="text-body-sm text-text-muted">{v("apply.usePreparedHint")}</p>
            <input type="file" accept=".pdf,.docx" aria-label={v("apply.usePrepared")} onChange={(e) => { const f = e.target.files?.[0]; if (f) onUsePrepared(f); }} />
            {prefill && prefill.status === "pending" && <p className="text-body-sm text-ai-text">{t("ai.pending")}</p>}
          </Card>
        )}
        <p className="text-caption text-text-muted">{v("apply.step", { n: step, total })} · {steps[step - 1]}</p>
        <Card className="flex flex-col gap-4">
          {fields.filter((f) => f.step === step).map((f) => {
            const common = { label: f.label, hint: prefilled.includes(f.key) ? `${v("apply.fromYourFile")}${f.hint ? ` · ${f.hint}` : ""}` : f.hint, required: f.required, value: values[f.key] ?? "" };
            return f.kind === "textarea"
              ? <TextArea key={f.key} {...common} onChange={(e) => onChange(f.key, e.target.value)} className={prefilled.includes(f.key) ? "border-ai-accent" : undefined} />
              : <TextField key={f.key} {...common} type={f.kind === "number" ? "number" : "text"} dir={f.kind === "number" ? "ltr" : undefined} onChange={(e) => onChange(f.key, e.target.value)} className={prefilled.includes(f.key) ? "border-ai-accent" : undefined} />;
          })}
        </Card>
        <div className="flex justify-between gap-2">
          <Button disabled={step === 1} onClick={() => setStep((s) => s - 1)}>{v("apply.back")}</Button>
          {step < total ? <Button variant="primary" onClick={() => setStep((s) => s + 1)}>{v("apply.next")}</Button> : (
            <Button variant="primary" disabled={!complete || blocking.length > 0} onClick={() => void onSubmit()}>{v("apply.submit")}</Button>
          )}
        </div>
        {step === total && !complete && <Alert tone="warning">{v("apply.incomplete")}</Alert>}
      </div>
      <aside className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardTitle>{v("apply.preview")}</CardTitle>
          <p className="mb-3 font-mono text-body-sm">{v("apply.complete", { done, total: required.length })}</p>
          <ul className="flex flex-col gap-2">
            {checks.map((c) => (
              <li key={c.key} className="flex gap-2 text-body-sm">
                <Icon name={c.passed ? "check" : "error"} size={16} className={c.passed ? "mt-1 text-dark-green" : "mt-1 text-danger-text"} />
                <span><span className="font-medium">{c.passed ? v("apply.eligible") : v("apply.issue")}:</span> {c.detail}</span>
              </li>
            ))}
          </ul>
        </Card>
      </aside>
    </div>
  );
}

/* J7 — application tracking (R-023) */
export type StageVM = { key: string; label: string; state: "done" | "current" | "upcoming"; atLabel?: string };
export function ApplicationTrackView({ application, stages, waiting, respondHref, submittedOn }: {
  application: ApplicationRow;
  stages: StageVM[];
  waiting: string | null;
  respondHref?: string | null;
  submittedOn: string;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 pb-24 md:pb-6">
      <PageHeader title={application.title} eyebrow={<span className="flex gap-2"><Eyebrow>{v("track.title")}</Eyebrow><RefNumber>{application.ref}</RefNumber></span>}
        description={formatDualDate(submittedOn)} actions={<StatusBadge tone={application.stageTone}>{application.stage}</StatusBadge>} />
      <Card>
        <CardTitle>{v("track.waitingOnYou")}</CardTitle>
        {waiting ? (
          <div className="flex flex-wrap items-center gap-3"><p className="flex-1 text-body">{waiting}</p>
            {respondHref && <a href={respondHref} className="inline-flex min-h-11 items-center rounded-md bg-action px-4 font-bold text-action-text">{v("track.respond")}</a>}</div>
        ) : <p className="text-body text-text-muted">{v("track.nothingWaiting")}</p>}
      </Card>
      <Card>
        <CardTitle>{v("track.stages")}</CardTitle>
        <ol className="flex flex-col gap-4">
          {stages.map((s) => (
            <li key={s.key} className="flex items-start gap-3" aria-current={s.state === "current" ? "step" : undefined}>
              <span aria-hidden="true" className={`mt-1 size-4 shrink-0 rounded-sm ${s.state === "done" ? "bg-dark-green" : s.state === "current" ? "bg-tech-green" : "border border-border bg-surface"}`} />
              <div className="flex-1"><p className={`text-body ${s.state === "current" ? "font-bold" : ""}`}>{s.label}</p>{s.atLabel && <p className="font-mono text-caption text-text-muted">{s.atLabel}</p>}</div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
