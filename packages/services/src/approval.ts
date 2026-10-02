import { randomUUID } from "node:crypto";
import { approval, DomainError, framework } from "@wbl/domain";
import { authorize, programOf, versionConfig, type Ctx } from "./context";
import { getApplication, getStudyFile, saveJudgement, transition } from "./cycle";
import { requestTask } from "./ai";
import { issueAgreement, onAmendmentApproval } from "./project";
import { onDisbursementApproval } from "./finance";

type Instance = { id: string; subject_kind: "application" | "disbursement" | "amendment"; subject_id: string; chain: approval.ApprovalState; current_level: number; status: string; version: number; amount_halalas: number; framework_version_id: string | null };

export async function openInstance(ctx: Ctx, subjectKind: Instance["subject_kind"], subjectId: string, chain: framework.ChainConfig, facts: approval.ApprovalFacts, frameworkVersionId: string | null) {
  const state = approval.openApproval(chain, facts);
  const id = randomUUID();
  await ctx.tx.query(
    "insert into approval.instances (tenant_id, id, subject_kind, subject_id, chain, current_level, status, amount_halalas, framework_version_id) values (app.tenant(), $1, $2, $3, $4, 0, 'open', $5, $6)",
    [id, subjectKind, subjectId, JSON.stringify(state), facts.amountHalalas, frameworkVersionId]);
  await ctx.tx.emit({ type: "approval.opened", entityKind: subjectKind, entityId: subjectId, payload: { instance_id: id, level: approval.currentLevel(state)?.label, awaiting_role: approval.currentLevel(state)?.role } });
  return { id, state };
}

export async function getInstance(ctx: Ctx, id: string): Promise<Instance> {
  return ctx.tx.one<Instance>("select id, subject_kind, subject_id, chain, current_level, status, version, amount_halalas, framework_version_id from approval.instances where id = $1", [id]);
}
export async function openInstanceFor(ctx: Ctx, subjectKind: string, subjectId: string): Promise<Instance | null> {
  return ctx.tx.maybe<Instance>("select id, subject_kind, subject_id, chain, current_level, status, version, amount_halalas, framework_version_id from approval.instances where subject_kind = $1 and subject_id = $2 and status = 'open'", [subjectKind, subjectId]);
}

/** R-038 + S5: the recommendation needs a recorded judgement; the application enters the approval chain of its version. */
export async function submitRecommendation(ctx: Ctx, id: string, input: { decision: "approve" | "approve_modified" | "reject"; amountHalalas: number; rationale: string }) {
  const app = await getApplication(ctx, id);
  authorize(ctx, "application.recommend", { assigneeMembershipId: app.assignee_membership_id });
  if (app.status !== "in_review") throw new DomainError("not_in_review", "الطلب ليس قيد الدراسة");
  const cfg = (await versionConfig(ctx.tx, app.framework_version_id)).config;
  const p = programOf(cfg, app.program_id);
  const amount = input.decision === "reject" ? 0 : input.amountHalalas;
  if (input.decision !== "reject" && (amount <= 0 || amount > p.capHalalas)) throw new DomainError("bad_amount", "المبلغ الموصى به خارج سقف البرنامج");
  const sf = await getStudyFile(ctx, id);
  if (!p.criteria.every((cr) => typeof sf?.scores?.[cr.key] === "number")) throw new DomainError("scores_required", "أدخل درجتك لكل معيار قبل رفع التوصية");
  await saveJudgement(ctx, id, { recommendation: input.decision, recommendedHalalas: amount, rationale: input.rationale });
  const chain = cfg.approvalChains.find((x) => x.id === p.approvalChainId)!;
  const inst = await openInstance(ctx, "application", id, chain, { amountHalalas: amount, program: p.id, recommendation: input.decision }, app.framework_version_id);
  await transition(ctx, app, "in_approval", {}, { type: "application.recommended", entityKind: "application", entityId: id, payload: { ref: app.ref, decision: input.decision, amount, instance_id: inst.id } });
  return { instanceId: inst.id, next: approval.remainingLabels(inst.state) };
}

/** R-079: is the current level of this instance waiting for the actor? Backup roles apply when every primary holder is absent. */
export async function awaitsActor(ctx: Ctx, inst: Instance): Promise<boolean> {
  const lvl = approval.currentLevel(inst.chain);
  if (!lvl) return false;
  const roles = ctx.actor.grants.map((g) => g.role);
  let primaryAvailable = true;
  if (lvl.backupRole && roles.includes(lvl.backupRole)) {
    const r = await ctx.tx.one<{ n: number }>(
      "select count(*)::int as n from iam.memberships where role = $1 and active and not (absent_from is not null and absent_from <= current_date and (absent_until is null or absent_until >= current_date))", [lvl.role]);
    primaryAvailable = r.n > 0;
  }
  return approval.isAwaiting(inst.chain, roles, primaryAvailable);
}

/** R-043: approve / reject / return / modify amount at the current level, recorded and applied to the subject. */
export async function act(ctx: Ctx, instanceId: string, action: { kind: "approve" | "reject" | "return" | "modify_amount"; note?: string; amountHalalas?: number; meetingId?: string | null }) {
  const inst = await getInstance(ctx, instanceId);
  if (inst.status !== "open") throw new DomainError("closed", "المسار مغلق");
  const lvl = approval.currentLevel(inst.chain);
  if (!lvl) throw new DomainError("closed");
  if (!ctx.system && !(await awaitsActor(ctx, inst))) authorize(ctx, "approval.act", { awaitingRoles: [] });
  if (lvl.committee && !action.meetingId && action.kind === "approve") throw new DomainError("minutes_required", "قرار اللجنة يُسجَّل من محضر");
  let next: approval.ApprovalState;
  if (action.kind === "modify_amount") {
    if (typeof action.amountHalalas !== "number") throw new DomainError("amount_required");
    next = approval.act(inst.chain, { kind: "modify_amount", amountHalalas: action.amountHalalas, facts: { amountHalalas: action.amountHalalas } });
  } else if (action.kind === "approve") next = approval.act(inst.chain, { kind: "approve" });
  else next = approval.act(inst.chain, { kind: action.kind, note: action.note ?? "" });
  await ctx.tx.query(
    "insert into approval.actions (tenant_id, instance_id, level, level_key, actor, action, amount_halalas, note, meeting_id) values (app.tenant(), $1, $2, $3, auth.uid(), $4, $5, $6, $7)",
    [inst.id, inst.chain.current, lvl.key, action.kind, action.amountHalalas ?? null, action.note ?? null, action.meetingId ?? null]);
  const r = await ctx.tx.query("update approval.instances set chain = $3, current_level = $4, status = $5, amount_halalas = $6, version = version + 1, closed_at = case when $5 <> 'open' then now() end where id = $1 and version = $2 returning id",
    [inst.id, inst.version, JSON.stringify(next), next.current, next.status, next.amountHalalas]);
  if (!r.length) throw new DomainError("stale_version", "تغيّر المسار. أعد التحميل.");
  await ctx.tx.emit({ type: "approval.acted", entityKind: inst.subject_kind, entityId: inst.subject_id, payload: { action: action.kind, level: lvl.label } });
  if (next.status === "open" && action.kind === "approve") {
    const nl = approval.currentLevel(next);
    await ctx.tx.emit({ type: "approval.opened", entityKind: inst.subject_kind, entityId: inst.subject_id, payload: { instance_id: inst.id, level: nl?.label, awaiting_role: nl?.role } });
  }
  if (next.status !== "open") await onCompleted(ctx, { ...inst, chain: next, status: next.status, amount_halalas: next.amountHalalas }, action.note ?? null);
  return next;
}

/** Applies the outcome to the subject — each owning module reacts in the same transaction. */
async function onCompleted(ctx: Ctx, inst: Instance, note: string | null) {
  await ctx.tx.emit({ type: "approval.completed", entityKind: inst.subject_kind, entityId: inst.subject_id, payload: { status: inst.status } });
  if (inst.subject_kind === "application") {
    const app = await getApplication(ctx, inst.subject_id);
    if (inst.status === "returned") {
      await transition(ctx, app, "in_review", {}, { type: "approval.acted", entityKind: "application", entityId: app.id, payload: { returned: true, note } });
      return;
    }
    const approved = inst.status === "approved";
    if (approved) {
      // ق٥: the final approval reserves the money, locking the account row (finance.post).
      const cfg = (await versionConfig(ctx.tx, app.framework_version_id)).config;
      const p = programOf(cfg, app.program_id);
      const accountName = cfg.budgetAccounts.find((a) => a.key === p.budgetAccount)!.name;
      const acct = await ctx.tx.maybe<{ id: string }>("select id from finance.budget_accounts where name = $1", [accountName]);
      if (!acct) throw new DomainError("no_budget_account", `حساب الميزانية «${accountName}» غير موجود`);
      await ctx.tx.query("select finance.post($1, 'reservation', $2, 'application', $3, $4)", [acct.id, inst.amount_halalas, app.id, app.ref]);
    }
    const decided = await transition(ctx, app, approved ? "approved" : "rejected",
      { decision: approved ? "approved" : "rejected", decided_at: ctx.now.toISOString(), approved_halalas: approved ? inst.amount_halalas : null },
      { type: "grant.decided", entityKind: "application", entityId: app.id, payload: { ref: app.ref, title: app.title, decision: approved ? "الموافقة" : "الاعتذار", amount: inst.amount_halalas, org_id: app.association_id, framework_version_id: app.framework_version_id } });
    await ctx.tx.query("update cycle.custody set to_at = now() where application_id = $1 and to_at is null and $2", [app.id, !approved]);
    if (approved) await issueAgreement(ctx, decided.id);
  }
  if (inst.subject_kind === "disbursement") {
    await onDisbursementApproval(ctx, inst.subject_id, inst.status as "approved" | "rejected" | "returned", note);
  }
  if (inst.subject_kind === "amendment") {
    await onAmendmentApproval(ctx, inst.subject_id, inst.status as "approved" | "rejected" | "returned");
  }
}

/** «بانتظار اعتمادك» for the actor (R-079): only instances whose current level waits for them. */
export async function awaitingMe(ctx: Ctx) {
  const rows = await ctx.tx.query<Instance & { ref: string | null; title: string | null }>(
    `select i.id, i.subject_kind, i.subject_id, i.chain, i.current_level, i.status, i.version, i.amount_halalas, i.framework_version_id, a.ref, a.title
       from approval.instances i left join cycle.applications a on a.tenant_id = i.tenant_id and a.id = i.subject_id
      where i.status = 'open' order by i.opened_at`);
  const out = [];
  for (const r of rows) if (await awaitsActor(ctx, r)) out.push(r);
  return out;
}

/* ── Committee (R-045, R-046) ── */

export async function committeeReady(ctx: Ctx) {
  const rows = await ctx.tx.query<Instance & { ref: string; title: string; association_id: string; association_name: string }>(
    `select i.id, i.subject_kind, i.subject_id, i.chain, i.current_level, i.status, i.version, i.amount_halalas, i.framework_version_id, a.ref, a.title, a.association_id, o.name as association_name
       from approval.instances i join cycle.applications a on a.tenant_id = i.tenant_id and a.id = i.subject_id
       join org.associations o on o.tenant_id = a.tenant_id and o.id = a.association_id
      where i.status = 'open' and i.subject_kind = 'application' order by a.ref`);
  return rows.filter((r) => approval.currentLevel(r.chain)?.committee);
}

export async function createMeeting(ctx: Ctx, input: { title: string; heldOn: string; minutesFileId: string; applicationIds: string[] }) {
  authorize(ctx, "committee.record", {});
  const id = randomUUID();
  await ctx.tx.query("insert into approval.committee_meetings (tenant_id, id, title, held_on, minutes_file_id, recorded_by) values (app.tenant(), $1, $2, $3, $4, auth.uid())",
    [id, input.title, input.heldOn, input.minutesFileId]);
  const apps = await ctx.tx.query<{ id: string; ref: string }>("select id, ref from cycle.applications where id = any($1)", [input.applicationIds]);
  const file = await ctx.tx.one<{ text_content: string | null; name: string }>("select text_content, name from kernel.files where id = $1", [input.minutesFileId]);
  const ai = await requestTask(ctx, { task: "committee.extract", subjectKind: "committee_meeting", subjectId: id, inputs: { application_refs: apps.map((a) => a.ref), attachments: [{ id: input.minutesFileId, name: file.name, text: file.text_content }] } });
  if (ai.id) await ctx.tx.query("update approval.committee_meetings set extract_output_id = $2 where id = $1", [id, ai.id]);
  return { meetingId: id, ai };
}

/** R-045: one minutes file settles several applications; each confirmed row acts at the committee level. */
export async function confirmCommitteeDecisions(ctx: Ctx, meetingId: string, rows: Array<{ applicationId: string; decision: "approve" | "reject" | "defer"; amountHalalas: number | null; note?: string }>) {
  authorize(ctx, "committee.record", {});
  const done: string[] = [];
  for (const row of rows) {
    if (row.decision === "defer") continue;
    const inst = await openInstanceFor(ctx, "application", row.applicationId);
    if (!inst || !approval.currentLevel(inst.chain)?.committee) continue;
    if (row.decision === "approve" && row.amountHalalas && row.amountHalalas !== inst.amount_halalas) {
      await act(ctx, inst.id, { kind: "modify_amount", amountHalalas: row.amountHalalas, meetingId });
    }
    await act(ctx, inst.id, row.decision === "approve" ? { kind: "approve", meetingId } : { kind: "reject", note: row.note || "قرار اللجنة بالمحضر", meetingId });
    done.push(row.applicationId);
  }
  await ctx.tx.emit({ type: "committee.decided", entityKind: "committee_meeting", entityId: meetingId, payload: { count: done.length } });
  return done;
}
