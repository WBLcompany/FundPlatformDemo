"use client";
import { useState } from "react";
import { Alert } from "../components/Alert";
import { RefNumber, StatusBadge, type StatusTone } from "../components/Badge";
import { Button } from "../components/Button";
import { Card, CardTitle, PageHeader, Stat } from "../components/Card";
import { SelectField, TextArea } from "../components/Field";
import { FileInput } from "../components/FileInput";
import { Table } from "../components/Table";
import { AiBadge, AiSuggestion, EvidenceDrawer, type AiState, type Evidence } from "../ai";
import { EntityRef, type EntityRefData } from "../entity/EntityRef";
import { formatMoney, formatNumber } from "../format";
import { t } from "../i18n";
import type { ApplicationRow } from "./types";

const v = (k: string, vars?: Record<string, string | number>) => t(`views.${k}`, vars);

/* M1 — grants manager home (R-078, R-079) */
export type PipelineStage = { key: string; label: string; count: number; href: string | null };
export type TeamMember = { id: string; person: EntityRefData; open: number; late: number; absent: boolean };
export function ManagerHomeView({ waiting, pipeline, team, period, reassignHref }: {
  waiting: ApplicationRow[];
  pipeline: PipelineStage[];
  team: TeamMember[];
  period: { approvedHalalas: number; disbursedHalalas: number; budgetLeftHalalas: number; approvedHref: string | null; disbursedHref: string | null };
  reassignHref: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={v("manager.title")} actions={<a href={reassignHref} className="inline-flex min-h-11 items-center rounded-md border border-deep-green px-4 font-bold">{v("manager.reassign")}</a>} />
      <section aria-labelledby="mgr-waiting">
        <h2 id="mgr-waiting" className="mb-3 text-h2 font-bold">{v("manager.waiting")}</h2>
        <AppTable rows={waiting} caption={v("manager.waiting")} />
      </section>
      <section aria-labelledby="mgr-pipeline">
        <h2 id="mgr-pipeline" className="mb-3 text-h2 font-bold">{v("manager.pipeline")}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {pipeline.map((p) => <Stat key={p.key} label={p.label} value={formatNumber(p.count)} href={p.href ?? undefined} />)}
        </div>
      </section>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardTitle>{v("manager.team")}</CardTitle>
          <Table caption={v("manager.team")} rows={team} rowKey={(r) => r.id} columns={[
            { key: "p", header: v("manager.member"), cell: (r) => <span className="flex items-center gap-2"><EntityRef entity={r.person} />{r.absent && <StatusBadge tone="neutral">{v("manager.absent")}</StatusBadge>}</span> },
            { key: "o", header: v("manager.open"), mono: true, cell: (r) => r.open },
            { key: "l", header: v("manager.late"), mono: true, cell: (r) => <span className={r.late ? "font-bold text-danger-text" : ""}>{r.late}</span> },
          ]} />
        </Card>
        <Card>
          <CardTitle>{v("manager.period")}</CardTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label={v("manager.approvedTotal")} value={formatMoney(period.approvedHalalas, false)} href={period.approvedHref ?? undefined} />
            <Stat label={v("manager.disbursedTotal")} value={formatMoney(period.disbursedHalalas, false)} href={period.disbursedHref ?? undefined} />
            <Stat label={v("manager.budgetLeft")} value={formatMoney(period.budgetLeftHalalas, false)} />
          </div>
        </Card>
      </div>
    </div>
  );
}

export function AppTable({ rows, caption }: { rows: ApplicationRow[]; caption: string }) {
  return (
    <Table caption={caption} rows={rows} rowKey={(r) => r.id} columns={[
      { key: "ref", header: "#", mono: true, cell: (r) => (r.href ? <a className="text-link hover:underline" href={r.href}>{r.ref}</a> : r.ref) },
      { key: "t", header: v("appTable.title"), cell: (r) => r.title },
      { key: "a", header: v("appTable.association"), cell: (r) => <EntityRef entity={r.association} /> },
      { key: "s", header: v("appTable.stage"), cell: (r) => <StatusBadge tone={r.stageTone}>{r.stage}</StatusBadge> },
      { key: "d", header: v("tasks.due"), cell: (r) => (r.dueAt ? <StatusBadge tone={r.dueTone ?? "neutral"}>{r.dueAt}</StatusBadge> : "—") },
      { key: "m", header: v("study.amount"), mono: true, cell: (r) => formatMoney(r.requestedHalalas, false) },
    ]} />
  );
}

/* M2 — reassignment (R-027) */
export function ReassignView({ applications, recipients, onReassign, done }: {
  applications: ApplicationRow[];
  recipients: Array<{ value: string; label: string }>;
  onReassign: (ids: string[], to: string, reason: string, handover: string) => void | Promise<void>;
  done?: boolean;
}) {
  const [sel, setSel] = useState<string[]>([]);
  const [to, setTo] = useState(recipients[0]?.value ?? "");
  const [reason, setReason] = useState("");
  const [handover, setHandover] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (done) return <Alert tone="success" title={v("reassign.done")} />;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={v("reassign.title")} />
      <Card>
        <CardTitle>{v("reassign.select")}</CardTitle>
        <ul className="flex flex-col divide-y divide-border">
          {applications.map((a) => (
            <li key={a.id} className="py-2">
              <label className="flex items-center gap-3 text-body">
                <input type="checkbox" checked={sel.includes(a.id)} onChange={(e) => setSel(e.target.checked ? [...sel, a.id] : sel.filter((x) => x !== a.id))} />
                <RefNumber>{a.ref}</RefNumber><span>{a.title}</span>
              </label>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="flex flex-col gap-4">
        <SelectField label={v("reassign.to")} options={recipients} value={to} onChange={(e) => setTo(e.target.value)} />
        <TextArea label={v("reassign.reason")} required value={reason} onChange={(e) => setReason(e.target.value)} error={err ?? undefined} />
        <TextArea label={v("reassign.handover")} value={handover} onChange={(e) => setHandover(e.target.value)} />
        <Button variant="primary" disabled={sel.length === 0} onClick={() => { if (!reason.trim()) { setErr(v("reassign.reasonRequired")); return; } void onReassign(sel, to, reason, handover); }}>{v("reassign.confirm")}</Button>
      </Card>
    </div>
  );
}

/* C1 — committee pack (R-046) */
export type CommitteeItem = { id: string; ref: string; title: string; association: EntityRefData; summary: AiState<string>; recommendation: string; amountHalalas: number; historyLine: string };
export function CommitteePackView({ items, minutesHref }: { items: CommitteeItem[]; minutesHref: string }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={v("committee.packTitle")} description={v("committee.ready")} actions={<a href={minutesHref} className="inline-flex min-h-11 items-center rounded-md bg-action px-4 font-bold text-action-text">{v("committee.minutesTitle")}</a>} />
      {items.map((it) => (
        <Card key={it.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2"><RefNumber>{it.ref}</RefNumber><h3 className="text-h3 font-bold">{it.title}</h3><EntityRef entity={it.association} /></div>
          <AiSuggestion state={it.summary} manual={null} render={(s) => <p className="text-body-sm">{s}</p>} />
          <p className="text-body-sm"><span className="text-text-muted">{v("study.recommendation")}:</span> {it.recommendation} — <span className="font-mono">{formatMoney(it.amountHalalas)}</span></p>
          <p className="text-caption text-text-muted">{it.historyLine}</p>
        </Card>
      ))}
    </div>
  );
}

/* C2 + C3 — upload minutes → committee.extract → confirm (R-045, R-047) */
export type ExtractedDecision = { applicationId: string; ref: string; title: string; decision: "approve" | "reject" | "defer"; amountHalalas: number | null; evidence: Evidence | null };
export function CommitteeMinutesView({ extraction, onUpload, onConfirm, done }: {
  extraction: AiState<ExtractedDecision[]> | null;
  onUpload: (file: File) => void;
  onConfirm: (rows: ExtractedDecision[]) => void | Promise<void>;
  done?: boolean;
}) {
  const rows = extraction && (extraction.status === "ready" || extraction.status === "edited") ? extraction.value : [];
  const [checked, setChecked] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, ExtractedDecision>>({});
  const [ev, setEv] = useState<Evidence | null>(null);
  if (done) return <Alert tone="success" title={v("committee.confirmed")} />;
  const current = rows.map((r) => edits[r.applicationId] ?? r);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={v("committee.minutesTitle")} />
      <Card>
        <FileInput label={v("committee.minutesFile")} accept=".pdf,.docx" onFiles={(fs) => onUpload(fs[0]!)} />
      </Card>
      {extraction && extraction.status !== "ready" && extraction.status !== "edited" && <AiSuggestion state={extraction} manual={null} render={() => null} />}
      {current.length > 0 && (
        <Card>
          <CardTitle action={<AiBadge />}>{v("committee.confirmTitle")}</CardTitle>
          <Table caption={v("committee.confirmTitle")} rows={current} rowKey={(r) => r.applicationId} columns={[
            { key: "c", header: v("committee.select"), cell: (r) => <input type="checkbox" aria-label={r.ref} checked={checked.includes(r.applicationId)} onChange={(e) => setChecked(e.target.checked ? [...checked, r.applicationId] : checked.filter((x) => x !== r.applicationId))} /> },
            { key: "r", header: "#", mono: true, cell: (r) => r.ref },
            { key: "t", header: v("study.item"), cell: (r) => r.title },
            { key: "d", header: v("committee.extracted"), cell: (r) => (
              <select aria-label={`${v("committee.extracted")} ${r.ref}`} className="rounded-sm border border-border px-2 py-1" value={r.decision} onChange={(e) => setEdits({ ...edits, [r.applicationId]: { ...r, decision: e.target.value as ExtractedDecision["decision"] } })}>
                <option value="approve">{v("study.decision.approve")}</option><option value="reject">{v("study.decision.reject")}</option><option value="defer">—</option>
              </select>) },
            { key: "a", header: v("study.amount"), mono: true, cell: (r) => (r.amountHalalas != null ? formatMoney(r.amountHalalas, false) : "—") },
            { key: "p", header: v("committee.position"), cell: (r) => (r.evidence ? <button type="button" className="text-link underline" onClick={() => setEv(r.evidence)}>{r.evidence.page == null ? t("ai.noEvidencePosition") : t("ai.evidencePage", { page: r.evidence.page })}</button> : "—") },
          ]} />
          <div className="mt-4 flex justify-end"><Button variant="primary" disabled={checked.length === 0} onClick={() => void onConfirm(current.filter((r) => checked.includes(r.applicationId)))}>{v("committee.confirmAll")}</Button></div>
        </Card>
      )}
      <EvidenceDrawer evidence={ev} onClose={() => setEv(null)} />
    </div>
  );
}

/* F1 — finance home (R-080) */
export type OrderRow = { id: string; ref: string; association: EntityRefData; amountHalalas: number; state: string; tone: StatusTone; reason?: string; href: string | null; dueLabel?: string };
export function FinanceHomeView({ awaiting, returned, upcoming }: { awaiting: OrderRow[]; returned: OrderRow[]; upcoming: OrderRow[] }) {
  const table = (rows: OrderRow[], caption: string) => (
    <Table caption={caption} rows={rows} rowKey={(r) => r.id} columns={[
      { key: "r", header: "#", mono: true, cell: (r) => (r.href ? <a className="text-link hover:underline" href={r.href}>{r.ref}</a> : r.ref) },
      { key: "a", header: v("appTable.association"), cell: (r) => <EntityRef entity={r.association} /> },
      { key: "m", header: v("study.amount"), mono: true, cell: (r) => formatMoney(r.amountHalalas, false) },
      { key: "s", header: v("appTable.state"), cell: (r) => <span className="flex flex-col gap-1"><StatusBadge tone={r.tone}>{r.state}</StatusBadge>{r.reason && <span className="text-caption text-text-muted">{r.reason}</span>}</span> },
      { key: "d", header: v("tasks.due"), cell: (r) => r.dueLabel ?? "—" },
    ]} />
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={v("finance.title")} />
      <section><h2 className="mb-3 text-h2 font-bold">{v("finance.awaiting")}</h2>{table(awaiting, v("finance.awaiting"))}</section>
      <section><h2 className="mb-3 text-h2 font-bold">{v("finance.returned")}</h2>{table(returned, v("finance.returned"))}</section>
      <section><h2 className="mb-3 text-h2 font-bold">{v("finance.upcoming")}</h2>{table(upcoming, v("finance.upcoming"))}</section>
    </div>
  );
}

/* F2 — disbursement order (R-063, R-065). Finance sees payment data only (R-081). */
export function DisbursementOrderView({ order, onExecute, onReturn, outcome }: {
  order: { ref: string; association: EntityRefData; project: EntityRefData; amountHalalas: number; account: { bank: string; ibanMasked: string; acknowledged: boolean }; blockers: string[]; installment: string };
  onExecute: (proofName: string, financeRef: string) => void | Promise<void>;
  onReturn: (reason: string) => void | Promise<void>;
  outcome?: "executed" | "returned" | null;
}) {
  const [proof, setProof] = useState<string>("");
  const [ref, setRef] = useState("");
  const [reason, setReason] = useState("");
  if (outcome === "executed") return <Alert tone="success" title={v("finance.executed")} />;
  if (outcome === "returned") return <Alert tone="info" title={v("finance.returnedDone")} />;
  const blocked = order.blockers.length > 0 || !order.account.acknowledged;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={v("finance.order")} eyebrow={<RefNumber>{order.ref}</RefNumber>} />
      <Card>
        <dl className="grid grid-cols-2 gap-3 text-body">
          <dt className="text-text-muted">{v("appTable.association")}</dt><dd><EntityRef entity={order.association} /></dd>
          <dt className="text-text-muted">{v("project.installments")}</dt><dd>{order.installment} — <EntityRef entity={order.project} /></dd>
          <dt className="text-text-muted">{v("study.amount")}</dt><dd className="font-mono text-h2">{formatMoney(order.amountHalalas)}</dd>
          <dt className="text-text-muted">{v("finance.account")}</dt><dd><span>{order.account.bank}</span> <span dir="ltr" className="font-mono">{order.account.ibanMasked}</span></dd>
        </dl>
      </Card>
      <Card>
        <CardTitle>{v("finance.blockers")}</CardTitle>
        {order.blockers.length === 0 ? <p className="text-body text-text-muted">{v("finance.noBlockers")}</p> : (
          <ul className="flex flex-col gap-2">{order.blockers.map((b) => <li key={b}><StatusBadge tone="late">{b}</StatusBadge></li>)}</ul>
        )}
      </Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <FileInput label={v("finance.proof")} onFiles={(fs) => setProof(fs[0]?.name ?? "")} />
          <label className="flex flex-col gap-1 text-caption font-medium">{v("finance.financeRef")}<input dir="ltr" className="rounded-sm border border-border px-3 py-2 font-mono text-body" value={ref} onChange={(e) => setRef(e.target.value)} /></label>
          <Button variant="primary" disabled={blocked || !proof} onClick={() => void onExecute(proof, ref)}>{v("finance.execute")}</Button>
        </Card>
        <Card className="flex flex-col gap-3">
          <TextArea label={v("finance.returnReason")} value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="danger" disabled={!reason.trim()} onClick={() => void onReturn(reason)}>{v("finance.returnWithReason")}</Button>
        </Card>
      </div>
    </div>
  );
}

/* E1 — executive home (R-082) */
export function ExecutiveHomeView({ decide, money, team, order, onReorder }: {
  decide: ApplicationRow[];
  money: Array<{ label: string; valueHalalas: number; href: string | null }>;
  team: TeamMember[];
  order: Array<"decide" | "money" | "team">;
  onReorder?: (order: Array<"decide" | "money" | "team">) => void;
}) {
  const blocks: Record<string, React.ReactNode> = {
    decide: <section key="decide"><h2 className="mb-3 text-h2 font-bold">{v("exec.decide")}</h2><AppTable rows={decide} caption={v("exec.decide")} /></section>,
    money: <section key="money"><h2 className="mb-3 text-h2 font-bold">{v("exec.money")}</h2><div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{money.map((m) => <Stat key={m.label} label={m.label} value={formatMoney(m.valueHalalas, false)} href={m.href ?? undefined} />)}</div></section>,
    team: <section key="team"><h2 className="mb-3 text-h2 font-bold">{v("exec.team")}</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{team.map((tm) => <Card key={tm.id}><EntityRef entity={tm.person} /><p className="font-mono text-body-sm">{tm.open} / {tm.late}</p></Card>)}</div></section>,
  };
  const move = (i: number, d: -1 | 1) => {
    const next = [...order];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    onReorder?.(next);
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={v("exec.title")} />
      {order.map((k, i) => (
        <div key={k} className="flex flex-col gap-2">
          {onReorder && <div className="flex gap-2 self-end text-caption"><button type="button" className="underline" onClick={() => move(i, -1)} aria-label={`↑ ${k}`}>↑</button><button type="button" className="underline" onClick={() => move(i, 1)} aria-label={`↓ ${k}`}>↓</button></div>}
          {blocks[k]}
        </div>
      ))}
    </div>
  );
}

/* E2 — question in the command bar (R-100, N-06) */
export type QueryAnswer = { understood: string; value: string; listHref: string | null } | { notUnderstood: true };
export function AskView({ onAsk, initial }: { onAsk: (q: string) => Promise<QueryAnswer>; initial?: { q: string; answer: QueryAnswer } }) {
  const [q, setQ] = useState(initial?.q ?? "");
  const [answer, setAnswer] = useState<QueryAnswer | null>(initial?.answer ?? null);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={v("exec.ask")} />
      <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); setAnswer(await onAsk(q)); }}>
        <label htmlFor="ask-q" className="sr-only">{v("exec.ask")}</label>
        <input id="ask-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={v("exec.askPlaceholder")} className="flex-1 rounded-md border border-border px-4 py-3 text-body focus:outline-2 focus:outline-focus" />
        <Button type="submit" variant="primary">{v("exec.ask")}</Button>
      </form>
      {answer && ("notUnderstood" in answer ? <Alert tone="info">{v("exec.notUnderstood")}</Alert> : (
        <Card className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-body-sm text-text-muted"><AiBadge />{v("exec.understood")}: {answer.understood}</p>
          <p className="font-mono text-display">{answer.value}</p>
          {answer.listHref && <a className="text-link underline-offset-4 hover:underline" href={answer.listHref}>{v("exec.openList")}</a>}
        </Card>
      ))}
    </div>
  );
}


