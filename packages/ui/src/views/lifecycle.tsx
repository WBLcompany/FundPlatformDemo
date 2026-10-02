"use client";
import { useState } from "react";
import { Alert, EmptyState } from "../components/Alert";
import { RefNumber, StatusBadge, type StatusTone } from "../components/Badge";
import { Button } from "../components/Button";
import { Card, CardTitle, PageHeader } from "../components/Card";
import { TextArea, TextField } from "../components/Field";
import { Table } from "../components/Table";
import { AiBadge, AiSuggestion, EvidenceDrawer, type AiState, type Evidence } from "../ai";
import { EntityPage } from "../entity/EntityPage";
import { EntityRef, type EntityRefData } from "../entity/EntityRef";
import type { ActivityItem } from "../entity/ActivityTimeline";
import { Icon } from "../icons";
import { formatDualDate, formatMoney } from "../format";
import { t } from "../i18n";
import type { BriefState } from "./types";

const v = (k: string, vars?: Record<string, string | number>) => t(`views.${k}`, vars);

/* A1 — agreement (R-048–R-050, N-13) */
export function AgreementView({ agreementRef, title, issuedAt, previewHref, associationSigned, donorSigned, canUploadSigned, canDonorSign, onUploadSigned, onDonorSign }: {
  agreementRef: string; title: string; issuedAt: string; previewHref: string | null;
  associationSigned: string | null; donorSigned: string | null;
  canUploadSigned: boolean; canDonorSign: boolean;
  onUploadSigned: (file: File) => void | Promise<void>;
  onDonorSign: () => void | Promise<void>;
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={v("agreement.title")} eyebrow={<RefNumber>{agreementRef}</RefNumber>} description={`${title} · ${formatDualDate(issuedAt)}`} />
      <Card className="flex items-center gap-3">
        <Icon name="file" />
        {previewHref ? <a href={previewHref} className="text-link underline-offset-4 hover:underline">{v("agreement.preview")}</a> : <span>{v("agreement.preview")}</span>}
      </Card>
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span>{v("agreement.assocSigned")}</span>
          {associationSigned ? <StatusBadge tone="done">{associationSigned}</StatusBadge> : <StatusBadge tone="neutral">{v("agreement.pending")}</StatusBadge>}
        </div>
        {!associationSigned && canUploadSigned && (
          <label className="flex flex-col gap-1 text-caption font-medium">{v("agreement.uploadSigned")}<input type="file" accept=".pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUploadSigned(f); }} /></label>
        )}
        <div className="flex items-center justify-between gap-3">
          <span>{v("agreement.donorSigned")}</span>
          {donorSigned ? <StatusBadge tone="done">{donorSigned}</StatusBadge> : <StatusBadge tone="neutral">{v("agreement.pending")}</StatusBadge>}
        </div>
        {!donorSigned && <Button variant="primary" disabled={!associationSigned || !canDonorSign} onClick={() => void onDonorSign()}>{v("agreement.donorSign")}</Button>}
        {associationSigned && donorSigned && <Alert tone="success">{v("agreement.signedBoth")}</Alert>}
      </Card>
    </div>
  );
}

/* P1 — project page on the entity template (R-097) */
export type InstallmentVM = { id: string; label: string; amountHalalas: number; state: string; tone: StatusTone };
export type DeliverableVM = { id: string; label: string; dueLabel: string; state: string; tone: StatusTone; href: string | null };
export function ProjectView({ title, reference, status, brief, facts, installments, deliverables, attachments, activity, actions }: {
  title: string; reference: string; status: { tone: StatusTone; label: string }; brief: BriefState;
  facts: Array<{ label: string; value: React.ReactNode }>;
  installments: InstallmentVM[]; deliverables: DeliverableVM[]; attachments: Array<{ id: string; name: string; href: string | null }>;
  activity: ActivityItem[]; actions?: React.ReactNode;
}) {
  return (
    <EntityPage kind={v("kinds.project")} title={title} reference={reference} status={status} brief={brief} facts={facts} activity={activity} actions={actions}>
      <Card>
        <CardTitle>{v("project.installments")}</CardTitle>
        <Table caption={v("project.installments")} rows={installments} rowKey={(r) => r.id} columns={[
          { key: "l", header: v("study.milestone"), cell: (r) => r.label },
          { key: "a", header: v("study.amount"), mono: true, cell: (r) => formatMoney(r.amountHalalas, false) },
          { key: "s", header: "", cell: (r) => <StatusBadge tone={r.tone}>{r.state}</StatusBadge> },
        ]} />
      </Card>
      <Card>
        <CardTitle>{v("project.deliverables")}</CardTitle>
        <Table caption={v("project.deliverables")} rows={deliverables} rowKey={(r) => r.id} columns={[
          { key: "l", header: v("study.deliverable"), cell: (r) => (r.href ? <a className="text-link hover:underline" href={r.href}>{r.label}</a> : r.label) },
          { key: "d", header: v("study.dueOn"), cell: (r) => r.dueLabel },
          { key: "s", header: "", cell: (r) => <StatusBadge tone={r.tone}>{r.state}</StatusBadge> },
        ]} />
      </Card>
      <Card>
        <CardTitle>{v("project.attachments")}</CardTitle>
        {attachments.length === 0 ? <p className="text-body-sm text-text-muted">{t("common.empty")}</p> : (
          <ul className="flex flex-col gap-2">{attachments.map((a) => <li key={a.id} className="flex items-center gap-2 text-body-sm"><Icon name="file" size={16} />{a.href ? <a className="text-link hover:underline" href={a.href}>{a.name}</a> : a.name}</li>)}</ul>
        )}
      </Card>
    </EntityPage>
  );
}

/* P2 — association uploads a deliverable (R-052) */
export function DeliverableUploadView({ label, dueLabel, onSubmit, done }: { label: string; dueLabel: string; onSubmit: (files: string[], beneficiaries: number, spentHalalas: number, note: string) => void | Promise<void>; done?: boolean }) {
  const [files, setFiles] = useState<string[]>([]);
  const [ben, setBen] = useState("");
  const [spent, setSpent] = useState("");
  const [note, setNote] = useState("");
  if (done) return <Alert tone="success" title={t("views.apply.submitted", { ref: label })} />;
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6 pb-24 md:pb-6">
      <PageHeader title={v("project.uploadDeliverable")} description={`${label} · ${dueLabel}`} />
      <Card className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-caption font-medium">{v("project.deliverableFiles")}<input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []).map((f) => f.name))} /></label>
        <TextField label={v("project.beneficiaries")} type="number" dir="ltr" required value={ben} onChange={(e) => setBen(e.target.value)} />
        <TextField label={v("project.spent")} type="number" dir="ltr" required value={spent} onChange={(e) => setSpent(e.target.value)} />
        <TextArea label={v("infoRequest.message")} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button variant="primary" disabled={files.length === 0 || !ben || !spent} onClick={() => void onSubmit(files, Number(ben), Math.round(Number(spent) * 100), note)}>{v("project.submitDeliverable")}</Button>
      </Card>
    </div>
  );
}

/* P3 — review a deliverable (R-052, R-053) */
export type DeliverableReview = { matches: Array<{ requirement: string; met: boolean; note: string; evidence?: Evidence }>; gaps: string[] };
export function DeliverableReviewView({ label, review, onDecide, outcome }: { label: string; review: AiState<DeliverableReview>; onDecide: (d: "accept" | "return" | "reject", note: string) => void | Promise<void>; outcome?: string | null }) {
  const [note, setNote] = useState("");
  const [ev, setEv] = useState<Evidence | null>(null);
  if (outcome === "accept") return <Alert tone="success" title={v("project.accepted")} />;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={v("project.review")} description={label} />
      <Card>
        <CardTitle>{v("project.matches")}</CardTitle>
        <AiSuggestion state={review} onEvidence={setEv} manual={<p className="text-body-sm text-text-muted">{t("common.empty")}</p>} render={(r) => (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">{r.matches.map((m) => (
              <li key={m.requirement} className="flex items-start gap-2 text-body-sm">
                <StatusBadge tone={m.met ? "done" : "late"}>{m.met ? v("study.passed") : v("study.failed")}</StatusBadge>
                <span><span className="font-medium">{m.requirement}</span> — {m.note}{m.evidence && <button type="button" className="ms-2 text-link underline" onClick={() => setEv(m.evidence!)}>{t("ai.evidence")}</button>}</span>
              </li>))}
            </ul>
            {r.gaps.length > 0 && <Alert tone="warning">{r.gaps.join("، ")}</Alert>}
          </div>
        )} />
      </Card>
      <Card className="flex flex-col gap-3">
        <TextArea label={v("infoRequest.message")} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="danger" onClick={() => void onDecide("reject", note)}>{v("project.reject")}</Button>
          <Button onClick={() => void onDecide("return", note)} disabled={!note.trim()}>{v("project.return")}</Button>
          <Button variant="primary" onClick={() => void onDecide("accept", note)}>{v("project.accept")}</Button>
        </div>
      </Card>
      <EvidenceDrawer evidence={ev} onClose={() => setEv(null)} />
    </div>
  );
}

/* D1 — association page (R-097) */
export function AssociationPageView({ name, reference, status, brief, facts, applications, grants, spentHalalas, rating, evaluations, activity }: {
  name: string; reference: string; status: { tone: StatusTone; label: string }; brief: BriefState;
  facts: Array<{ label: string; value: React.ReactNode }>;
  applications: Array<{ id: string; entity: EntityRefData; stage: string; tone: StatusTone }>;
  grants: Array<{ id: string; entity: EntityRefData; amountHalalas: number }>;
  spentHalalas: number; rating: string | null; evaluations: Array<{ id: string; text: string }>; activity: ActivityItem[];
}) {
  return (
    <EntityPage kind={v("kinds.association")} title={name} reference={reference} status={status} brief={brief} activity={activity}
      facts={[...facts, { label: v("assoc.spent"), value: <span className="font-mono">{formatMoney(spentHalalas)}</span> }, { label: v("assoc.rating"), value: rating ?? "—" }]}>
      <Card>
        <CardTitle>{v("assoc.applications")}</CardTitle>
        <ul className="flex flex-col divide-y divide-border">{applications.map((a) => <li key={a.id} className="flex justify-between gap-2 py-2"><EntityRef entity={a.entity} /><StatusBadge tone={a.tone}>{a.stage}</StatusBadge></li>)}</ul>
      </Card>
      <Card>
        <CardTitle>{v("assoc.grants")}</CardTitle>
        <ul className="flex flex-col divide-y divide-border">{grants.map((g) => <li key={g.id} className="flex justify-between gap-2 py-2"><EntityRef entity={g.entity} /><span className="font-mono">{formatMoney(g.amountHalalas, false)}</span></li>)}</ul>
      </Card>
      <Card>
        <CardTitle>{v("assoc.evaluations")}</CardTitle>
        {evaluations.length === 0 ? <p className="text-body-sm text-text-muted">{t("common.empty")}</p> : <ul className="flex flex-col gap-2">{evaluations.map((e) => <li key={e.id} className="text-body-sm">{e.text}</li>)}</ul>}
      </Card>
    </EntityPage>
  );
}

/* D2 — decision rationale (R-089) */
export function DecisionRationaleView({ appRef, title, decision, decidedAt, frameworkVersion, scores, recommendations, approvers, minutes }: {
  appRef: string; title: string; decision: string; decidedAt: string; frameworkVersion: string;
  scores: Array<{ criterion: string; weight: number; manih: number | null; human: number }>;
  recommendations: Array<{ by: string; text: string; ai?: boolean }>;
  approvers: Array<{ level: string; by: string; action: string; atLabel: string }>;
  minutes: { name: string; href: string | null; decisionLine: string } | null;
}) {
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <PageHeader title={`${v("rationale.title")} — ${title}`} eyebrow={<RefNumber>{appRef}</RefNumber>} description={`${decision} · ${formatDualDate(decidedAt)}`} />
      <Card><p className="text-body">{v("rationale.version")}: <RefNumber>{frameworkVersion}</RefNumber></p></Card>
      <Card>
        <CardTitle>{v("rationale.scores")}</CardTitle>
        <Table caption={v("rationale.scores")} rows={scores} rowKey={(r) => r.criterion} columns={[
          { key: "c", header: t("ai.score.criterion"), cell: (r) => r.criterion },
          { key: "w", header: t("ai.score.weight"), mono: true, cell: (r) => `${r.weight}%` },
          { key: "m", header: t("ai.score.manih"), mono: true, cell: (r) => r.manih ?? "—" },
          { key: "h", header: t("ai.score.human"), mono: true, cell: (r) => r.human },
        ]} />
      </Card>
      <Card>
        <CardTitle>{v("rationale.recommendations")}</CardTitle>
        <ul className="flex flex-col gap-3">{recommendations.map((r, i) => <li key={i} className="flex flex-col gap-1"><span className="flex items-center gap-2 text-caption text-text-muted">{r.ai && <AiBadge />}{r.by}</span><p className="text-body">{r.text}</p></li>)}</ul>
      </Card>
      <Card>
        <CardTitle>{v("rationale.approvers")}</CardTitle>
        <ol className="flex flex-col gap-2">{approvers.map((a, i) => <li key={i} className="flex flex-wrap gap-2 text-body-sm"><span className="font-medium">{a.level}</span><span>{a.by}</span><span>{a.action}</span><span className="font-mono text-text-muted">{a.atLabel}</span></li>)}</ol>
      </Card>
      <Card>
        <CardTitle>{v("rationale.minutes")}</CardTitle>
        {minutes ? <p className="text-body-sm">{minutes.href ? <a className="text-link hover:underline" href={minutes.href}>{minutes.name}</a> : minutes.name} — {minutes.decisionLine}</p> : <p className="text-body-sm text-text-muted">—</p>}
      </Card>
    </div>
  );
}

/* G1–G4 — onboarding (R-003–R-006, R-087, N-14) */
export type ChecklistStep = { key: string; label: string; done: boolean; required: boolean; href: string | null; suggestion?: string };
export function SetupChecklistView({ steps }: { steps: ChecklistStep[] }) {
  const missing = steps.filter((s) => s.required && !s.done);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={v("setup.checklist")} />
      {missing.length > 0 && <Alert tone="warning" title={v("setup.missingBeforeOpen")}>{missing.map((m) => m.label).join("، ")}</Alert>}
      <Card>
        <ol className="flex flex-col divide-y divide-border">
          {steps.map((s) => (
            <li key={s.key} className="flex flex-wrap items-center gap-3 py-3">
              <StatusBadge tone={s.done ? "done" : s.required ? "near" : "neutral"}>{s.done ? t("status.done") : "—"}</StatusBadge>
              <span className="flex-1 text-body">{s.href ? <a className="text-link hover:underline" href={s.href}>{s.label}</a> : s.label}</span>
              {s.suggestion && <span className="flex items-center gap-2 text-caption text-ai-text"><AiBadge />{s.suggestion}</span>}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

export type PolicyClause = { id: string; text: string; source: string | null };
export function PolicyBuilderView({ draft, onUpload, onApprove, approved }: { draft: AiState<PolicyClause[]> | null; onUpload: (f: File) => void; onApprove: () => void | Promise<void>; approved?: boolean }) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={v("setup.policyTitle")} />
      <Card className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-caption font-medium">{v("setup.uploadPolicy")}<input type="file" multiple accept=".pdf,.docx" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} /></label>
        <p className="text-body-sm text-text-muted">{v("setup.orAnswer")}</p>
      </Card>
      {draft && (
        <Card>
          <CardTitle>{v("setup.draft")}</CardTitle>
          <AiSuggestion state={draft} manual={<TextArea label={v("setup.draft")} />} render={(clauses) => (
            <ol className="flex list-decimal flex-col gap-3 ps-5">{clauses.map((c) => <li key={c.id} className="text-body">{c.text}{c.source && <span className="ms-2 text-caption text-ai-text">— {c.source}</span>}</li>)}</ol>
          )} />
          <div className="mt-4 flex justify-end">{approved ? <StatusBadge tone="done" /> : <Button variant="primary" onClick={() => void onApprove()}>{v("setup.approvePolicy")}</Button>}</div>
        </Card>
      )}
    </div>
  );
}

export type DerivedConfig = { criteria: Array<{ name: string; weight: number }>; eligibility: Array<{ when: string; then: string }>; chain: string[] };
export function DerivedConfigView({ config, simulation, onSimulate, onApprove, approved }: { config: AiState<DerivedConfig>; simulation: string | null; onSimulate: () => void; onApprove: () => void | Promise<void>; approved?: boolean }) {
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <PageHeader title={v("setup.derivedTitle")} />
      <AiSuggestion state={config} manual={<EmptyState title={t("common.empty")} />} render={(c) => (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card><CardTitle>{t("views.study.criteria")}</CardTitle><ul className="flex flex-col gap-1">{c.criteria.map((x) => <li key={x.name} className="flex justify-between text-body-sm"><span>{x.name}</span><span className="font-mono">{x.weight}%</span></li>)}</ul></Card>
          <Card><CardTitle>{v("setup.eligibilityTable")}</CardTitle><ul className="flex flex-col gap-2">{c.eligibility.map((x, i) => <li key={i} className="text-body-sm"><span className="font-mono text-caption">{x.when}</span> ← {x.then}</li>)}</ul></Card>
          <Card><CardTitle>{v("setup.chain")}</CardTitle><ol className="flex flex-col gap-1">{c.chain.map((x) => <li key={x} className="text-body-sm">{x}</li>)}</ol></Card>
        </div>
      )} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {simulation && <span className="me-auto text-body-sm">{simulation}</span>}
        <Button onClick={onSimulate}>{v("setup.simulate")}</Button>
        {approved ? <StatusBadge tone="done" /> : <Button variant="primary" onClick={() => void onApprove()}>{v("setup.approveConfig")}</Button>}
      </div>
    </div>
  );
}

export function FrameworkVersionView({ number, approvedBy, approvedAt, reason, changes }: { number: string; approvedBy: string; approvedAt: string; reason: string; changes: string[] }) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={v("setup.versionTitle")} eyebrow={<RefNumber>{number}</RefNumber>} />
      <Card>
        <dl className="grid grid-cols-2 gap-3 text-body">
          <dt className="text-text-muted">{v("setup.approvedBy")}</dt><dd>{approvedBy} · {formatDualDate(approvedAt)}</dd>
          <dt className="text-text-muted">{v("setup.reason")}</dt><dd>{reason}</dd>
        </dl>
      </Card>
      <Card><CardTitle>{v("setup.changes")}</CardTitle><ul className="flex list-disc flex-col gap-1 ps-5">{changes.map((c) => <li key={c} className="text-body-sm">{c}</li>)}</ul></Card>
    </div>
  );
}

/* O1 — platform health (R-083–R-085). No donor data on this screen. */
export function OperatorHealthView({ donors, incidents }: { donors: Array<{ id: string; name: string; plan: string; completed: number; status: string; tone: StatusTone; supportUntil: string | null }>; incidents: Array<{ id: string; title: string; tone: StatusTone; state: string }> }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={v("operator.title")} description={v("operator.noAccess")} />
      <Card>
        <CardTitle>{v("operator.donors")}</CardTitle>
        <Table caption={v("operator.donors")} rows={donors} rowKey={(r) => r.id} columns={[
          { key: "n", header: t("views.register.name"), cell: (r) => r.name },
          { key: "p", header: v("operator.plan"), cell: (r) => r.plan },
          { key: "c", header: v("operator.completed"), mono: true, cell: (r) => r.completed },
          { key: "s", header: "", cell: (r) => <StatusBadge tone={r.tone}>{r.status}</StatusBadge> },
          { key: "g", header: "", cell: (r) => (r.supportUntil ? <span className="text-caption">{v("operator.supportGrant", { date: r.supportUntil })}</span> : "—") },
        ]} />
      </Card>
      <Card>
        <CardTitle>{v("operator.incidents")}</CardTitle>
        <ul className="flex flex-col gap-2">{incidents.map((i) => <li key={i.id} className="flex justify-between gap-2 text-body-sm"><span>{i.title}</span><StatusBadge tone={i.tone}>{i.state}</StatusBadge></li>)}</ul>
      </Card>
    </div>
  );
}
