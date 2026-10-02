import "server-only";
import { t } from "../i18n";
import { approval as approvalDomain, framework } from "@wbl/domain";
import { ai, approvalService, cycleService, queries, versionConfig, programOf, type Ctx } from "@wbl/services";
import type { StudyFileVM } from "@wbl/ui/views";
import { resolveRef } from "@wbl/kernel";
import { aiState, evidenceOf } from "./ai";
import { appTone, statusLabel } from "./status";

/** Builds the S2 view model from the database (R-031–R-039). */
export async function loadStudy(ctx: Ctx, id: string) {
  const app = await cycleService.getApplication(ctx, id);
  const ver = await versionConfig(ctx.tx, app.framework_version_id);
  const p = programOf(ver.config, app.program_id);
  const donor = await ctx.tx.one<{ ai_enabled: boolean }>("select ai_enabled from platform.donors where id = app.tenant()");
  const assoc = await ctx.tx.one<{ name: string }>("select name from org.associations where id = $1", [app.association_id]);
  const sf = await cycleService.getStudyFile(ctx, id);
  const out = await ai.latestOutput(ctx, id, "application.study_file");
  const attachIds = ((app.form_data.__attachments as string[]) ?? []);
  const files = new Map((await ctx.tx.query<{ id: string; name: string }>("select id, name from kernel.files where id = any($1)", [attachIds])).map((f) => [f.id, f.name]));
  const pv = await cycleService.preview(ctx, id);
  const open = out?.output as { summary?: { text: string; evidence: never[] }; budget_flags?: Array<{ item: string; amount_halalas: number; reason: string; evidence: never[] }>; schedule?: Array<{ label: string; percent: number; deliverable: string; due_offset_days: number }> } | undefined;
  const sealed = out?.sealed as { scores?: Array<{ criterion: string; score: number; rationale: string; evidence: never[] }>; recommendation?: { decision: "approve" | "reject" | "approve_modified"; amount_halalas: number; rationale: string } } | null | undefined;
  const revealed = app.study_mode === "manih_first" || !!sealed;
  const history = await ctx.tx.query<{ ref: string; title: string; status: string; approved_halalas: number | null; requested_halalas: number | null }>(
    "select ref, title, status, approved_halalas, requested_halalas from cycle.applications where association_id = $1 and id <> $2 and status <> 'draft' order by submitted_at desc", [app.association_id, id]);
  const requested = app.requested_halalas ?? 0;
  const inst = await approvalService.openInstanceFor(ctx, "application", id);
  const awaiting = inst ? await approvalService.awaitsActor(ctx, inst) : false;
  const agreement = await ctx.tx.maybe<{ id: string }>("select id from project.agreements where application_id = $1 order by version_no desc limit 1", [id]);
  const projectRow = await ctx.tx.maybe<{ id: string }>("select id from project.projects where application_id = $1", [id]);
  const isAssignee = ctx.actor.grants.some((g) => g.membershipId === app.assignee_membership_id);

  const vm: StudyFileVM = {
    application: {
      id, ref: app.ref ?? "—", title: app.title, program: p.name, stage: statusLabel(app.status), stageTone: appTone[app.status] ?? "neutral", requestedHalalas: requested, href: null,
      association: resolveRef(ctx.actor, { kind: "association", id: app.association_id, label: assoc.name, orgId: app.association_id }),
    },
    frameworkVersion: ver.number,
    mode: app.study_mode,
    revealed,
    aiEnabled: donor.ai_enabled,
    checks: pv ? [
      { key: "complete", label: t("study.complete"), passed: pv.completeness.done === pv.completeness.total, detail: t("study.completeDetail", { done: pv.completeness.done, total: pv.completeness.total }) },
      ...p.eligibility.rules.map((r) => { const hit = pv.eligibility.reasons.find((x) => x.ruleId === r.id); return { key: r.id, label: r.label ?? r.reason, passed: !hit, detail: hit ? hit.reason : t("study.passed"), rule: r.reason }; }),
    ] : [],
    summary: aiState(out, donor.ai_enabled, (o) => (o as typeof open)?.summary?.text, evidenceOf(open?.summary?.evidence, files)),
    scores: p.criteria.map((c) => {
      const s = sealed?.scores?.find((x) => x.criterion === c.key);
      return { criterion: c.name, weight: c.weight, max: c.max, human: sf?.scores?.[c.key] ?? null, manih: donor.ai_enabled && s ? { score: s.score, rationale: s.rationale, evidence: evidenceOf(s.evidence, files) } : null };
    }),
    maxScore: 5,
    budget: aiState(out, donor.ai_enabled, (o) => (o as typeof open)?.budget_flags?.map((b, i) => ({ id: String(i), item: b.item, amountHalalas: b.amount_halalas, flag: { reason: b.reason, evidence: evidenceOf(b.evidence, files) } }))),
    schedule: aiState(out, donor.ai_enabled, (o) => (o as typeof open)?.schedule?.map((s, i) => ({ id: String(i), label: s.label, dueLabel: t("study.afterDays", { days: s.due_offset_days }), amountHalalas: Math.round(((sealed?.recommendation?.amount_halalas ?? requested) * s.percent) / 100), deliverable: s.deliverable }))),
    recommendation: revealed && sealed?.recommendation ? { status: "ready", outputId: out!.id, value: { decision: sealed.recommendation.decision, amountHalalas: sealed.recommendation.amount_halalas, rationale: sealed.recommendation.rationale } } : aiState<{ decision: "approve" | "reject" | "approve_modified"; amountHalalas: number; rationale: string }>(out, donor.ai_enabled, () => undefined),
    history: history.map((h) => ({ ref: h.ref, title: h.title, outcome: statusLabel(h.status), amountHalalas: h.approved_halalas ?? h.requested_halalas ?? 0 })),
    attachments: [...files.entries()].map(([fid, name]) => ({ id: fid, name, href: `/api/files/${fid}` })),
    judgement: { decision: sf?.recommendation ? t(`study.decision.${sf.recommendation}`) : null, amountHalalas: sf?.recommended_halalas ?? null, byName: sf?.judged_by_name ?? null },
  };
  // Manih's draft, offered as the editable starting point of the specialist's own judgement (never saved by itself).
  const aiDraft = donor.ai_enabled && out?.status === "ready" ? { summary: open?.summary?.text ?? "", schedule: (open?.schedule ?? []).map((s, i, all) => ({ ...s, condition: i === 0 ? "signature" : i === all.length - 1 ? "final_report" : "deliverable" })) } : null;
  return { aiDraft, app, vm, program: p, inst, awaiting, agreement, project: projectRow, isAssignee, sf, criteria: p.criteria as framework.Criterion[], level: inst ? approvalDomain.currentLevel(inst.chain) : null, chainLabels: inst ? inst.chain.applicable.map((l) => l.label) : [], activity: await queries.activity(ctx, "application", id) };
}
