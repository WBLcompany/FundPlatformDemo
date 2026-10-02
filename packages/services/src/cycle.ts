import { cycle, DomainError, framework, type Halalas } from "@wbl/domain";
import { authorize, currentVersion, holidays, programOf, riyadhToday, versionConfig, type Ctx } from "./context";
import { readiness } from "./org";
import { requestTask } from "./ai";

type AppRow = {
  id: string; ref: string | null; association_id: string; program_id: string; framework_version_id: string; status: cycle.ApplicationStatus;
  version: number; title: string; form_data: Record<string, unknown>; requested_halalas: Halalas | null; assignee_membership_id: string | null;
  study_mode: "manih_first" | "independent"; due_at: string | null; submitted_at: string | null; approved_halalas: Halalas | null; decision: string | null; track: string | null;
};
const APP_COLS = "id, ref, association_id, program_id, framework_version_id, status, version, title, form_data, requested_halalas, assignee_membership_id, study_mode, due_at, submitted_at, approved_halalas, decision, track";

export async function getApplication(ctx: Ctx, id: string): Promise<AppRow> {
  const a = await ctx.tx.maybe<AppRow>(`select ${APP_COLS} from cycle.applications where id = $1`, [id]);
  if (!a) throw new DomainError("not_found", "الطلب غير موجود أو لا تملك صلاحية الاطلاع");
  return a;
}

/** Writes a new status with the version check, the SLA clock and the event, in the caller's transaction (invariant 2). */
export async function transition(ctx: Ctx, app: AppRow, to: cycle.ApplicationStatus, extra: Record<string, unknown> = {}, event?: Parameters<Ctx["tx"]["emit"]>[0]) {
  cycle.assertTransition(app.status, to);
  const cfg = (await versionConfig(ctx.tx, app.framework_version_id)).config;
  const slaDays = (cfg.settings.sla as Record<string, number>)[to];
  const due = cycle.SLA_STATUSES.includes(to) && slaDays ? cycle.addBusinessDays(ctx.now, slaDays, await holidays(ctx.tx)) : null;
  const sets = ["status = $3", "version = version + 1", "due_at = $4", "sla_breached_at = null"];
  const params: unknown[] = [app.id, app.version, to, due?.toISOString() ?? null];
  for (const [k, v] of Object.entries(extra)) { params.push(v); sets.push(`${k} = $${params.length}`); }
  const r = await ctx.tx.query<{ version: number }>(`update cycle.applications set ${sets.join(", ")} where id = $1 and version = $2 returning version`, params);
  if (!r.length) throw new DomainError("stale_version", "تغيّر الطلب منذ فتحته. أعد التحميل.");
  if (event) await ctx.tx.emit(event);
  return { ...app, status: to, version: r[0]!.version, due_at: due?.toISOString() ?? null };
}

/* ── Association side ── */

export async function createDraft(ctx: Ctx, associationId: string, programId: string) {
  authorize(ctx, "application.create", { orgId: associationId });
  const cur = await currentVersion(ctx.tx);
  const p = programOf(cur.config, programId);
  if (!cycle.programIsOpen(p, ctx.now)) throw new DomainError("program_closed", "التقديم على البرنامج مغلق");
  if (p.access === "invite") {
    const inv = await ctx.tx.maybe("select 1 from cycle.invitations where program_id = $1 and association_id = $2 and status = 'accepted' and deadline > now()", [programId, associationId]);
    if (!inv) throw new DomainError("invite_only", "هذا البرنامج بالدعوة فقط");
  }
  const existing = await ctx.tx.maybe<{ id: string }>("select id from cycle.applications where association_id = $1 and program_id = $2 and status = 'draft'", [associationId, programId]);
  if (existing) return existing.id;
  const row = await ctx.tx.one<{ id: string }>(
    "insert into cycle.applications (tenant_id, association_id, program_id, framework_version_id, study_mode, track, created_by) values (app.tenant(), $1, $2, $3, $4, $5, auth.uid()) returning id",
    [associationId, programId, cur.id, p.studyMode ?? cur.config.settings.studyMode, p.track ?? null]);
  await ctx.tx.emit({ type: "application.created", entityKind: "application", entityId: row.id, payload: { org_id: associationId } });
  return row.id;
}

/** R-022 autosave: partial validation; the version is bumped like any write. */
export async function saveForm(ctx: Ctx, id: string, data: Record<string, unknown>) {
  const app = await getApplication(ctx, id);
  authorize(ctx, "application.submit", { orgId: app.association_id });
  if (app.status !== "draft" && app.status !== "awaiting_info") throw new DomainError("locked", "لا يُعدَّل الطلب بعد إرساله إلا عند طلب الاستكمال");
  const cfg = (await versionConfig(ctx.tx, app.framework_version_id)).config;
  const p = programOf(cfg, app.program_id);
  // Keys outside the form schema are dropped, except platform bookkeeping (__attachments).
  const clean: Record<string, unknown> = Object.fromEntries(Object.entries(app.form_data).filter(([k]) => k.startsWith("__")));
  for (const k of Object.keys(p.form.properties)) if (k in data) clean[k] = data[k];
  const errors = framework.validateForm(p.form, clean, { partial: true });
  const mapped = framework.mappedValues(p.form, clean);
  await ctx.tx.query(
    "update cycle.applications set form_data = $3, title = $4, requested_halalas = $5, version = version + 1 where id = $1 and version = $2",
    [id, app.version, JSON.stringify(clean), mapped.title ?? "", mapped.requestedHalalas ?? null]);
  return { errors, savedAt: ctx.now.toISOString() };
}

/** N-02: the deterministic preview the association sees while filling the form. */
export async function preview(ctx: Ctx, id: string) {
  const app = await getApplication(ctx, id);
  const cfg = (await versionConfig(ctx.tx, app.framework_version_id)).config;
  const p = programOf(cfg, app.program_id);
  const ready = await readiness(ctx, app.association_id, app.program_id);
  const open = await ctx.tx.one<{ n: number }>(
    "select count(*)::int as n from cycle.applications where association_id = $1 and program_id = $2 and status in ('submitted','in_review','awaiting_info','in_approval') and id <> $3",
    [app.association_id, app.program_id, id]);
  const mapped = framework.mappedValues(p.form, app.form_data);
  const verdict = cycle.checkEligibility(p, {
    association: { ready: ready.ready, openApplicationsInProgram: open.n, licenseValid: !ready.items.some((i) => i.key === "doc:license" && !i.ok), overdueObligations: ready.items.some((i) => i.key === "obligations" && !i.ok) ? 1 : 0 },
    application: { requestedHalalas: mapped.requestedHalalas ?? 0, beneficiaries: mapped.beneficiaries },
    program: { capHalalas: p.capHalalas, isOpen: cycle.programIsOpen(p, ctx.now), id: p.id },
  });
  const completeness = framework.completeness(p.form, app.form_data);
  const errors = framework.validateForm(p.form, app.form_data);
  return { readiness: ready, eligibility: verdict, completeness, errors, program: p };
}

/** R-022, R-015, R-024: submit = readiness + eligibility + completeness, a reference number, an assignee, an SLA — one transaction. */
export async function submit(ctx: Ctx, id: string) {
  let app = await getApplication(ctx, id);
  authorize(ctx, "application.submit", { orgId: app.association_id });
  if (app.status !== "draft") throw new DomainError("already_submitted", "أُرسل الطلب من قبل");
  // Invariant 5: pin to the version current AT SUBMISSION (Q-3 proposal: the submission version governs).
  const cur = await currentVersion(ctx.tx);
  if (cur.id !== app.framework_version_id) {
    await ctx.tx.query("update cycle.applications set framework_version_id = $3, version = version + 1 where id = $1 and version = $2", [id, app.version, cur.id]);
    app = await getApplication(ctx, id);
  }
  const pv = await preview(ctx, id);
  if (!pv.readiness.ready) throw new DomainError("not_ready", "الجمعية غير جاهزة للتقديم", pv.readiness.items.filter((i) => !i.ok));
  if (Object.keys(pv.errors).length) throw new DomainError("incomplete", "أكمل الحقول المطلوبة قبل الإرسال", pv.errors);
  if (!pv.eligibility.pass) throw new DomainError("ineligible", pv.eligibility.reasons.map((r) => r.reason).join("، "), pv.eligibility.reasons);

  const ref = (await ctx.tx.one<{ next_ref: string }>("select cycle.next_ref('application', 'ط')")).next_ref;
  const assignee = await chooseAssignee(ctx, app.program_id, id, []);
  if (!assignee) throw new DomainError("no_assignee", "لا يوجد أخصائي متاح للإسناد. أبلغ مدير المنح.");
  app = await transition(ctx, app, "submitted", { ref, assignee_membership_id: assignee.membershipId, submitted_at: ctx.now.toISOString() },
    { type: "application.submitted", entityKind: "application", entityId: id, payload: { ref, title: app.title, org_id: app.association_id } });
  await openCustody(ctx, id, assignee.membershipId, "auto", null);
  await ctx.tx.emit({ type: "application.assigned", entityKind: "application", entityId: id, payload: { ref, title: app.title, membership_id: assignee.membershipId, due: app.due_at } });
  await requestStudyFile(ctx, id);
  return { ref, assigneeMembershipId: assignee.membershipId };
}

async function chooseAssignee(ctx: Ctx, programId: string, applicationId: string, exclude: string[]) {
  const cfg = (await currentVersion(ctx.tx)).config;
  const cands = await ctx.tx.query<{ membership_id: string; person_id: string; open_load: number; absent_from: string | null; absent_until: string | null; active: boolean; conflicted: boolean }>(
    "select * from cycle.assignment_candidates($1)", [applicationId]);
  return cycle.pickAssignee({
    candidates: cands.map((c) => ({ membershipId: c.membership_id, personId: c.person_id, openLoad: c.open_load, absentFrom: c.absent_from, absentUntil: c.absent_until, active: c.active })),
    programSpecialists: cfg.settings.assignment.specialistsByProgram[programId], conflicted: cands.filter((c) => c.conflicted).map((c) => c.membership_id), exclude, today: riyadhToday(ctx.now),
  });
}

async function openCustody(ctx: Ctx, applicationId: string, membershipId: string, reason: string, note: string | null) {
  if (reason !== "auto") await ctx.tx.query("update cycle.custody set to_at = now() where application_id = $1 and to_at is null", [applicationId]);
  await ctx.tx.query("insert into cycle.custody (tenant_id, application_id, membership_id, reason, handover_note, assigned_by) values (app.tenant(), $1, $2, $3, $4, $5)",
    [applicationId, membershipId, reason, note, ctx.system ? null : ctx.actor.personId]);
}

/** Builds the redacted Manih inputs for the study file (R-033–R-038) and requests it. */
export async function requestStudyFile(ctx: Ctx, id: string) {
  const app = await getApplication(ctx, id);
  const cfg = (await versionConfig(ctx.tx, app.framework_version_id)).config;
  const p = programOf(cfg, app.program_id);
  const assoc = await ctx.tx.one<{ name: string }>("select name from org.associations where id = $1", [app.association_id]);
  const history = await ctx.tx.query("select ref, title, status, approved_halalas from cycle.applications where association_id = $1 and id <> $2 and status <> 'draft'", [app.association_id, id]);
  const budgetText = String(app.form_data.budgetLines ?? "");
  const budget = budgetText.split("\n").map((l) => l.split(/[:：]/)).filter((x) => x.length === 2).map(([item, amt]) => ({ item: item!.trim(), amount_halalas: Math.round(Number(String(amt).replace(/[^\d.]/g, "")) * 100) })).filter((b) => b.item && Number.isFinite(b.amount_halalas));
  const attachmentIds = (app.form_data.__attachments as string[] | undefined) ?? [];
  const attachments = attachmentIds.length ? await ctx.tx.query<{ id: string; name: string; text_content: string | null }>("select id, name, text_content from kernel.files where id = any($1)", [attachmentIds]) : [];
  const { __attachments: _a, ...form } = app.form_data;
  return requestTask(ctx, {
    task: "application.study_file", subjectKind: "application", subjectId: id, frameworkVersionId: app.framework_version_id,
    names: [],
    // Attachment text is untrusted data, never instructions (docs/02-ai-layer.md §3).
    inputs: { title: app.title, form, requested_halalas: app.requested_halalas, criteria: p.criteria, budget, program: { id: p.id, name: p.name, cap_halalas: p.capHalalas, conditions: p.conditions }, association: { name: assoc.name, history }, attachments: attachments.map((f) => ({ id: f.id, name: f.name, text: f.text_content })) },
  });
}

/* ── Staff side ── */

/** Opening a submitted application starts the review (R-023: the status shown matches the real stage). */
export async function startReview(ctx: Ctx, id: string) {
  const app = await getApplication(ctx, id);
  if (app.status !== "submitted") return app;
  authorize(ctx, "application.study", { assigneeMembershipId: app.assignee_membership_id });
  return transition(ctx, app, "in_review");
}

/** R-032 / N-07: the info request text is edited by a person before it is sent; it reaches the official email. */
export async function requestInfo(ctx: Ctx, id: string, input: { items: string[]; message: string; draftOutputId?: string | null }) {
  const app = await getApplication(ctx, id);
  authorize(ctx, "application.request_info", { assigneeMembershipId: app.assignee_membership_id });
  if (!input.items.length || !input.message.trim()) throw new DomainError("empty", "حدد النواقص واكتب الرسالة");
  const cur = app.status === "submitted" ? await transition(ctx, app, "in_review") : app;
  await ctx.tx.query("insert into cycle.info_requests (tenant_id, application_id, items, message, draft_output_id, sent_by) values (app.tenant(), $1, $2, $3, $4, auth.uid())",
    [id, JSON.stringify(input.items), input.message, input.draftOutputId ?? null]);
  await transition(ctx, cur, "awaiting_info", {}, { type: "application.info_requested", entityKind: "application", entityId: id, payload: { ref: app.ref, title: app.title, message: input.message, items: input.items, org_id: app.association_id } });
}

export async function draftInfoMessage(ctx: Ctx, id: string, items: string[]) {
  const app = await getApplication(ctx, id);
  return requestTask(ctx, { task: "message.draft", subjectKind: "application", subjectId: id, inputs: { purpose: "info_request", title: app.title, items } });
}

export async function answerInfo(ctx: Ctx, id: string, note: string) {
  const app = await getApplication(ctx, id);
  authorize(ctx, "application.respond_info", { orgId: app.association_id });
  if (app.status !== "awaiting_info") throw new DomainError("not_awaiting");
  await ctx.tx.query("update cycle.info_requests set status = 'answered', answered_at = now(), answer_note = $2 where application_id = $1 and status = 'open'", [id, note]);
  await transition(ctx, app, "in_review", {}, { type: "application.info_answered", entityKind: "application", entityId: id, payload: { ref: app.ref, title: app.title, org_id: app.association_id } });
}

export async function withdraw(ctx: Ctx, id: string) {
  const app = await getApplication(ctx, id);
  authorize(ctx, "application.withdraw", { orgId: app.association_id, status: app.status });
  await transition(ctx, app, "withdrawn", {}, { type: "application.withdrawn", entityKind: "application", entityId: id, payload: { ref: app.ref, org_id: app.association_id } });
  await ctx.tx.query("update cycle.custody set to_at = now() where application_id = $1 and to_at is null", [id]);
}

/** R-027 / R-090: reassignment needs a reason; both parties are notified and can object. */
export async function reassign(ctx: Ctx, ids: string[], toMembershipId: string | null, reason: string, handover: string | null) {
  authorize(ctx, "application.reassign", {});
  if (!reason.trim()) throw new DomainError("reason_required", "السبب إلزامي للترحيل");
  const out: string[] = [];
  for (const id of ids) {
    const app = await getApplication(ctx, id);
    if (!cycle.OPEN_STATUSES.includes(app.status)) continue;
    const target = toMembershipId ?? (await chooseAssignee(ctx, app.program_id, id, app.assignee_membership_id ? [app.assignee_membership_id] : []))?.membershipId;
    if (!target) throw new DomainError("no_assignee", "لا يوجد مستلم متاح");
    const conflicted = await ctx.tx.maybe("select 1 from cycle.coi_declarations where application_id = $1 and membership_id = $2", [id, target]);
    if (conflicted) throw new DomainError("conflict", "المستلم صرّح بتعارض مصالح في هذا الطلب");
    const from = app.assignee_membership_id;
    await ctx.tx.query("update cycle.applications set assignee_membership_id = $3, version = version + 1 where id = $1 and version = $2", [id, app.version, target]);
    await openCustody(ctx, id, target, reason, handover);
    await ctx.tx.emit({ type: "application.reassigned", entityKind: "application", entityId: id, payload: { ref: app.ref, title: app.title, from_membership: from, to_membership: target, reason } });
    out.push(id);
  }
  return out;
}

/** N-08: a conflict declaration is recorded and the application moves to someone else. */
export async function declareConflict(ctx: Ctx, id: string, note: string | null) {
  authorize(ctx, "application.declare_coi", {});
  const mine = ctx.actor.grants.find((g) => g.role === "grants_specialist" || g.role === "grants_manager");
  if (!mine) throw new DomainError("forbidden");
  const app = await getApplication(ctx, id);
  await ctx.tx.query("insert into cycle.coi_declarations (tenant_id, application_id, membership_id, note) values (app.tenant(), $1, $2, $3) on conflict do nothing", [id, mine.membershipId, note]);
  await ctx.tx.emit({ type: "application.coi_declared", entityKind: "application", entityId: id, payload: { membership_id: mine.membershipId } });
  if (app.assignee_membership_id === mine.membershipId) {
    const next = await chooseAssignee(ctx, app.program_id, id, [mine.membershipId]);
    if (!next) throw new DomainError("no_assignee", "لا يوجد أخصائي آخر متاح");
    await ctx.tx.query("update cycle.applications set assignee_membership_id = $3, version = version + 1 where id = $1 and version = $2", [id, app.version, next.membershipId]);
    await openCustody(ctx, id, next.membershipId, "تصريح تعارض مصالح", null);
    await ctx.tx.emit({ type: "application.reassigned", entityKind: "application", entityId: id, payload: { ref: app.ref, title: app.title, from_membership: mine.membershipId, to_membership: next.membershipId, reason: "تصريح تعارض مصالح" } });
  }
}

/** R-039: recording the specialist's own scores releases Manih's sealed opinion for comparison. */
export async function recordAssessment(ctx: Ctx, id: string, scores: Record<string, number>) {
  const app = await getApplication(ctx, id);
  authorize(ctx, "application.study", { assigneeMembershipId: app.assignee_membership_id });
  const cfg = (await versionConfig(ctx.tx, app.framework_version_id)).config;
  const p = programOf(cfg, app.program_id);
  for (const c of p.criteria) {
    const s = scores[c.key];
    if (typeof s !== "number" || s < 0 || s > c.max) throw new DomainError("score_required", `أدخل درجة «${c.name}» من 0 إلى ${c.max}`);
  }
  await ctx.tx.query("insert into cycle.assessments (tenant_id, application_id, person_id, scores) values (app.tenant(), $1, auth.uid(), $2) on conflict (tenant_id, application_id, person_id) do nothing", [id, JSON.stringify(scores)]);
  await saveJudgement(ctx, id, { scores });
  await ctx.tx.emit({ type: "assessment.recorded", entityKind: "application", entityId: id });
}

/** The specialist's judgement — scores, summary, schedule, recommendation (R-034, R-036, R-038). */
export async function saveJudgement(ctx: Ctx, id: string, input: { scores?: Record<string, number>; summary?: string; schedule?: unknown[]; recommendation?: "approve" | "approve_modified" | "reject"; recommendedHalalas?: number | null; rationale?: string; studyOutputId?: string | null }) {
  const app = await getApplication(ctx, id);
  authorize(ctx, "application.study", { assigneeMembershipId: app.assignee_membership_id });
  const existing = await ctx.tx.maybe<{ id: string; scores: Record<string, number> }>("select id, scores from cycle.study_files where application_id = $1", [id]);
  const scores = { ...(existing?.scores ?? {}), ...(input.scores ?? {}) };
  const judged = input.recommendation ? { by: ctx.actor.personId, at: ctx.now.toISOString() } : null;
  if (input.recommendation && !input.rationale?.trim()) throw new DomainError("rationale_required", "اكتب مبررات التوصية");
  if (!existing) {
    await ctx.tx.query(
      `insert into cycle.study_files (tenant_id, application_id, summary, scores, schedule, recommendation, recommended_halalas, rationale, study_output_id, judged_by, judged_at)
       values (app.tenant(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, input.summary ?? null, JSON.stringify(scores), JSON.stringify(input.schedule ?? []), input.recommendation ?? null, input.recommendedHalalas ?? null, input.rationale ?? null, input.studyOutputId ?? null, judged?.by ?? null, judged?.at ?? null]);
  } else {
    await ctx.tx.query(
      `update cycle.study_files set summary = coalesce($2, summary), scores = $3, schedule = coalesce($4, schedule), recommendation = coalesce($5, recommendation),
         recommended_halalas = coalesce($6, recommended_halalas), rationale = coalesce($7, rationale), study_output_id = coalesce($8, study_output_id),
         judged_by = coalesce($9, judged_by), judged_at = coalesce($10, judged_at), version = version + 1 where application_id = $1`,
      [id, input.summary ?? null, JSON.stringify(scores), input.schedule ? JSON.stringify(input.schedule) : null, input.recommendation ?? null, input.recommendedHalalas ?? null, input.rationale ?? null, input.studyOutputId ?? null, judged?.by ?? null, judged?.at ?? null]);
  }
}

export async function getStudyFile(ctx: Ctx, id: string) {
  return ctx.tx.maybe<{ summary: string | null; scores: Record<string, number>; schedule: Array<Record<string, unknown>>; recommendation: string | null; recommended_halalas: number | null; rationale: string | null; judged_by: string | null; judged_at: string | null; judged_by_name: string | null }>(
    `select s.summary, s.scores, s.schedule, s.recommendation, s.recommended_halalas, s.rationale, s.judged_by, s.judged_at, p.full_name as judged_by_name
       from cycle.study_files s left join iam.persons p on p.id = s.judged_by where s.application_id = $1`, [id]);
}

/** Weighted total on 100 from criterion scores (R-034). */
export function weightedTotal(criteria: framework.Criterion[], scores: Record<string, number>): number | null {
  if (!criteria.every((c) => typeof scores[c.key] === "number")) return null;
  return Math.round(criteria.reduce((s, c) => s + (scores[c.key]! / c.max) * c.weight, 0));
}
