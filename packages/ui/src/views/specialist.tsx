"use client";
import { useMemo, useState } from "react";
import { Alert, EmptyState } from "../components/Alert";
import { Eyebrow, RefNumber, StatusBadge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card, CardTitle, PageHeader } from "../components/Card";
import { SelectField, TextArea, TextField } from "../components/Field";
import { Table } from "../components/Table";
import { AiScoreTable, AiSuggestion, EvidenceChip, EvidenceDrawer, EntityBrief, AiBadge, type AiState, type Evidence, type Feedback } from "../ai";
import { EntityRef } from "../entity/EntityRef";
import { Icon } from "../icons";
import { formatMoney } from "../format";
import { t } from "../i18n";
import type { BudgetLineVM, ScheduleRowVM, StudyFileVM, TaskVM } from "./types";

const v = (k: string, vars?: Record<string, string | number>) => t(`views.${k}`, vars);

/* S1 — my tasks (R-077) */
export function MyTasksView({ tasks, title }: { tasks: TaskVM[]; title?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={title ?? v("tasks.title")} />
      {tasks.length === 0 ? <EmptyState title={v("tasks.empty")} /> : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li key={task.id}>
              <Card className="flex flex-wrap items-center gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2"><Eyebrow>{task.kind}</Eyebrow><EntityRef entity={task.entity} /></div>
                  <p className="text-body font-bold">{task.title}</p>
                  <p className="flex items-center gap-2 text-body-sm text-text">
                    <span className="text-text-muted">{v("tasks.whatYouNeed")}:</span>
                    {task.whatYouNeedToDo.status === "plain" ? task.whatYouNeedToDo.value
                      : task.whatYouNeedToDo.status === "ready" || task.whatYouNeedToDo.status === "edited"
                        ? <><AiBadge />{task.whatYouNeedToDo.value}</> : null}
                  </p>
                </div>
                <StatusBadge tone={task.dueTone}>{task.dueLabel}</StatusBadge>
                {task.href && <a href={task.href} className="inline-flex min-h-11 items-center rounded-md border border-deep-green px-4 font-bold hover:bg-neutral-50">{v("tasks.open")}</a>}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* S2 / S2-indep / S2-reveal / S3 — study file (R-031–R-039, N-12) */
export type StudyActions = {
  onHumanScore?: (criterion: string, score: number) => void;
  onRecordAndReveal?: () => void | Promise<void>;
  onFeedback?: (outputId: string, f: Feedback) => void;
  onAcceptSummary?: () => void;
  requestInfoHref?: string;
  submitRecommendationHref?: string;
  onConflict?: () => void | Promise<void>;
};
export function StudyFileView({ file, brief, actions = {}, initialEvidence = null }: { file: StudyFileVM; brief?: AiState<{ now: string; waiting: string; risk?: string }>; actions?: StudyActions; initialEvidence?: Evidence | null }) {
  const [evidence, setEvidence] = useState<Evidence | null>(initialEvidence);
  const [scores, setScores] = useState(file.scores);
  const hidden = file.mode === "independent" && !file.revealed;
  const weighted = useMemo(() => {
    const filled = scores.filter((s) => s.human != null);
    if (filled.length === 0) return null;
    return Math.round(scores.reduce((sum, s) => sum + ((s.human ?? 0) / s.max) * s.weight, 0));
  }, [scores]);
  const allScored = scores.every((s) => s.human != null);
  const fb = (id: string) => (f: Feedback) => actions.onFeedback?.(id, f);
  const outId = (s: AiState<unknown>) => (s.status === "ready" || s.status === "edited" ? s.outputId : "");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={file.application.title}
        eyebrow={<span className="flex flex-wrap items-center gap-2"><Eyebrow>{v("study.title")}</Eyebrow><RefNumber>{file.application.ref}</RefNumber><span className="text-caption text-text-muted">{v("program.version")}: <RefNumber>{file.frameworkVersion}</RefNumber></span></span>}
        actions={<>
          {actions.requestInfoHref && <a href={actions.requestInfoHref} className="inline-flex min-h-11 items-center rounded-md border border-deep-green px-4 font-bold hover:bg-neutral-50">{v("study.requestInfo")}</a>}
          {actions.submitRecommendationHref && <a href={actions.submitRecommendationHref} className="inline-flex min-h-11 items-center rounded-md bg-action px-4 font-bold text-action-text hover:bg-light-green">{v("study.submitRecommendation")}</a>}
        </>}
      />
      <div className="flex flex-wrap items-center gap-3 text-body-sm">
        <EntityRef entity={file.application.association} />
        <span className="text-text-muted">·</span><span>{file.application.program}</span>
        <span className="text-text-muted">·</span><span className="font-mono">{formatMoney(file.application.requestedHalalas)}</span>
        <StatusBadge tone={file.application.stageTone}>{file.application.stage}</StatusBadge>
        {actions.onConflict && <button type="button" onClick={() => void actions.onConflict?.()} className="ms-auto text-caption text-text-muted underline">{v("study.conflict")}</button>}
      </div>
      {brief && <EntityBrief state={brief} />}

      <Card>
        <CardTitle>{v("study.checks")}</CardTitle>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {file.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2 text-body-sm">
              <StatusBadge tone={c.passed ? "done" : "late"}>{c.passed ? v("study.passed") : v("study.failed")}</StatusBadge>
              <span><span className="font-medium">{c.label}</span> — {c.detail}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardTitle>{v("study.summary")}</CardTitle>
        <AiSuggestion state={file.summary} render={(s) => <p className="max-w-[72ch] whitespace-pre-line">{s}</p>}
          manual={<TextArea label={v("study.manualSummary")} />} onEvidence={setEvidence} onAccept={actions.onAcceptSummary ? () => actions.onAcceptSummary?.() : undefined} onFeedback={fb(outId(file.summary))} />
      </Card>

      <Card>
        <CardTitle action={weighted != null && <span className="font-mono text-body">{v("study.total")}: {weighted}/100</span>}>{v("study.criteria")}</CardTitle>
        {hidden && <div className="mb-3"><Alert tone="info">{v("study.independentNote")}</Alert></div>}
        {file.mode === "independent" && file.revealed && <div className="mb-3"><Alert tone="success">{v("study.revealed")}</Alert></div>}
        <AiScoreTable caption={v("study.criteria")} rows={scores} aiEnabled={file.aiEnabled} hiddenReason={hidden ? "independent" : null} onEvidence={setEvidence}
          onHumanChange={(criterion, score) => { setScores((rows) => rows.map((r) => (r.criterion === criterion ? { ...r, human: score } : r))); actions.onHumanScore?.(criterion, score); }} />
        {hidden && actions.onRecordAndReveal && (
          <div className="mt-4 flex justify-end"><Button variant="primary" disabled={!allScored} onClick={() => void actions.onRecordAndReveal?.()}>{v("study.recordAndReveal")}</Button></div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardTitle>{v("study.budget")}</CardTitle>
          <AiSuggestion state={file.budget} onEvidence={setEvidence} onFeedback={fb(outId(file.budget))}
            manual={<p className="text-body-sm text-text-muted">{t("common.empty")}</p>}
            render={(lines: BudgetLineVM[]) => (
              <Table caption={v("study.budget")} rows={lines} rowKey={(r) => r.id} columns={[
                { key: "i", header: v("study.item"), cell: (r) => r.item },
                { key: "a", header: v("study.amount"), mono: true, cell: (r) => formatMoney(r.amountHalalas, false) },
                { key: "f", header: v("study.flag"), cell: (r) => r.flag ? <span className="flex flex-col gap-1 text-danger-text"><span className="flex items-center gap-1"><Icon name="warning" size={14} />{r.flag.reason}</span>{r.flag.evidence?.map((e, i) => <EvidenceChip key={i} evidence={e} onOpen={setEvidence} />)}</span> : "—" },
              ]} />
            )} />
        </Card>
        <Card>
          <CardTitle>{v("study.schedule")}</CardTitle>
          <AiSuggestion state={file.schedule} onFeedback={fb(outId(file.schedule))}
            manual={<p className="text-body-sm text-text-muted">{t("common.empty")}</p>}
            render={(rows: ScheduleRowVM[]) => (
              <Table caption={v("study.schedule")} rows={rows} rowKey={(r) => r.id} columns={[
                { key: "l", header: v("study.milestone"), cell: (r) => r.label },
                { key: "d", header: v("study.dueOn"), cell: (r) => r.dueLabel },
                { key: "x", header: v("study.deliverable"), cell: (r) => r.deliverable },
                { key: "a", header: v("study.amount"), mono: true, cell: (r) => formatMoney(r.amountHalalas, false) },
              ]} />
            )} />
        </Card>
      </div>

      <Card>
        <CardTitle>{v("study.recommendation")}</CardTitle>
        {hidden ? <p className="text-body-sm text-text-muted">{t("ai.score.hidden")}</p> : (
          <AiSuggestion state={file.recommendation} onFeedback={fb(outId(file.recommendation))}
            manual={<TextArea label={v("study.manualRecommendation")} />}
            render={(r) => (
              <div className="flex flex-col gap-2">
                <p className="text-body font-bold">{v(`study.decision.${r.decision}`)} — <span className="font-mono">{formatMoney(r.amountHalalas)}</span></p>
                <p className="max-w-[72ch] text-body">{r.rationale}</p>
              </div>
            )} />
        )}
        <p className="mt-3 text-caption text-text-muted">{v("study.yourJudgement")}: {file.judgement.decision ? `${file.judgement.decision}${file.judgement.byName ? ` — ${file.judgement.byName}` : ""}` : "—"}</p>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardTitle>{v("study.history")}</CardTitle>
          {file.history.length === 0 ? <p className="text-body-sm text-text-muted">{v("study.noHistory")}</p> : (
            <ul className="flex flex-col divide-y divide-border">
              {file.history.map((h) => <li key={h.ref} className="flex justify-between gap-2 py-2 text-body-sm"><span><RefNumber>{h.ref}</RefNumber> {h.title}</span><span>{h.outcome} · <span className="font-mono">{formatMoney(h.amountHalalas, false)}</span></span></li>)}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle>{v("study.attachments")}</CardTitle>
          <ul className="flex flex-col gap-2">
            {file.attachments.map((a) => <li key={a.id} className="flex items-center gap-2 text-body-sm"><Icon name="file" size={16} />{a.href ? <a className="text-link hover:underline" href={a.href}>{a.name}</a> : a.name}</li>)}
          </ul>
        </Card>
      </div>
      <EvidenceDrawer evidence={evidence} onClose={() => setEvidence(null)} />
    </div>
  );
}

/* S4 — info request with message.draft (R-032, N-07). Nothing is sent without a human edit/confirm. */
export function InfoRequestView({ appRef, missing, draft, onSend, sent }: {
  appRef: string;
  missing: string[];
  draft: AiState<string>;
  onSend: (message: string, missing: string[]) => void | Promise<void>;
  sent?: boolean;
}) {
  const initial = draft.status === "ready" || draft.status === "edited" ? draft.value : "";
  const [text, setText] = useState(initial);
  const [items, setItems] = useState(missing);
  if (sent) return <Alert tone="success" title={v("infoRequest.sent")} />;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={v("infoRequest.title")} eyebrow={<RefNumber>{appRef}</RefNumber>} />
      <Card>
        <CardTitle>{v("infoRequest.missing")}</CardTitle>
        <ul className="flex flex-col gap-2">
          {missing.map((m) => (
            <li key={m}><label className="flex items-center gap-2 text-body"><input type="checkbox" checked={items.includes(m)} onChange={(e) => setItems(e.target.checked ? [...items, m] : items.filter((x) => x !== m))} />{m}</label></li>
          ))}
        </ul>
      </Card>
      <Card className="flex flex-col gap-3">
        {draft.status !== "disabled" && draft.status !== "failed" && <div className="flex items-center gap-2"><AiBadge /><span className="text-caption text-text-muted">{t("ai.badgeLabel")}</span></div>}
        <TextArea label={v("infoRequest.message")} value={text} onChange={(e) => setText(e.target.value)} className="min-h-48" />
        <div className="flex justify-end"><Button variant="primary" disabled={!text.trim() || items.length === 0} onClick={() => void onSend(text, items)}>{v("infoRequest.send")}</Button></div>
      </Card>
    </div>
  );
}

/* S5 — submit recommendation (R-038) */
export function SubmitRecommendationView({ appRef, suggested, nextChain, onSubmit, done }: {
  appRef: string;
  suggested: { decision: string; amountHalalas: number } | null;
  nextChain: string[];
  onSubmit: (decision: string, amountHalalas: number) => void | Promise<void>;
  done?: boolean;
}) {
  const [decision, setDecision] = useState(suggested?.decision ?? "approve");
  const [amount, setAmount] = useState(String((suggested?.amountHalalas ?? 0) / 100));
  if (done) return <Alert tone="success" title={v("submitRec.done")} />;
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <PageHeader title={v("submitRec.title")} eyebrow={<RefNumber>{appRef}</RefNumber>} />
      <Card className="flex flex-col gap-4">
        <SelectField label={v("submitRec.decision")} value={decision} onChange={(e) => setDecision(e.target.value)}
          options={["approve", "approve_modified", "reject"].map((d) => ({ value: d, label: v(`study.decision.${d}`) }))} />
        {decision !== "reject" && <TextField label={v("submitRec.amount")} type="number" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        <div>
          <p className="mb-2 text-caption font-medium">{v("submitRec.next")}</p>
          <ol className="flex flex-wrap items-center gap-2 text-body-sm">
            {nextChain.map((c, i) => <li key={c} className="flex items-center gap-2">{i > 0 && <Icon name="arrowEnd" size={14} />}<span className="rounded-sm bg-neutral-100 px-2 py-1">{c}</span></li>)}
          </ol>
        </div>
        <Button variant="primary" onClick={() => void onSubmit(decision, Math.round(Number(amount) * 100))}>{v("submitRec.confirm")}</Button>
      </Card>
    </div>
  );
}
