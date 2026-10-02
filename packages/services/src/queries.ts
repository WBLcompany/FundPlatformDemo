import { approval, cycle, finance as financeDomain, framework, iam, type Halalas } from "@wbl/domain";
import { resolveRef, searchPattern, type EntityRefOut } from "@wbl/kernel";
import { authorize, currentVersion, holidays, programOf, versionConfig, type Ctx } from "./context";
import { awaitingMe, awaitsActor } from "./approval";
import { latestOutput } from "./ai";

/** Read models for the screens. Every query runs under the viewer's RLS; links pass through resolveRef (R-097). */

export type TaskItem = { id: string; kind: string; title: string; entity: EntityRefOut; whatToDo: string; due: string | null; tone: "active" | "near" | "late" | "neutral"; href: string | null };

const ref = (ctx: Ctx, e: Parameters<typeof resolveRef>[1]) => resolveRef(ctx.actor, e);

/** R-077: «مهامي» — the entry point for every role, each task with one line saying what is expected. */
export async function myTasks(ctx: Ctx): Promise<TaskItem[]> {
  const roles = ctx.actor.grants.map((g) => g.role);
  const mine = ctx.actor.grants.map((g) => g.membershipId);
  const hol = await holidays(ctx.tx);
  const tone = (due: string | null) => (due ? cycle.dueTone(new Date(due), ctx.now, hol) : "neutral") as TaskItem["tone"];
  const out: TaskItem[] = [];

  if (roles.some((r) => r === "grants_specialist" || r === "grants_manager")) {
    const apps = await ctx.tx.query<{ id: string; ref: string; title: string; status: cycle.ApplicationStatus; due_at: string | null; association_id: string; assignee_membership_id: string }>(
      "select id, ref, title, status, due_at, association_id, assignee_membership_id from cycle.applications where assignee_membership_id = any($1) and status in ('submitted','in_review','awaiting_info') order by due_at nulls last", [mine]);
    for (const a of apps) {
      const sf = await latestOutput(ctx, a.id, "application.study_file");
      const what = a.status === "awaiting_info" ? "بانتظار استكمال الجمعية؛ لا إجراء عليك حتى تردّ."
        : sf?.status === "ready" ? "ملف الدراسة جاهز: راجع الفحوص والدرجات، ثم احكم وارفع التوصية."
        : sf?.status === "pending" ? "مانح يجهّز ملف الدراسة؛ يمكنك البدء يدوياً الآن."
        : "ادرس الطلب واحكم وارفع التوصية.";
      out.push({ id: `app:${a.id}`, kind: "دراسة", title: a.title, entity: ref(ctx, { kind: "application", id: a.id, label: a.ref, orgId: a.association_id, assigneeMembershipId: a.assignee_membership_id }), whatToDo: what, due: a.due_at, tone: tone(a.due_at), href: `/staff/applications/${a.id}` });
    }
    const dels = await ctx.tx.query<{ id: string; label: string; project_id: string; project_ref: string; association_id: string }>(
      `select d.id, d.label, d.project_id, p.ref as project_ref, p.association_id from project.deliverables d join project.projects p on p.tenant_id = d.tenant_id and p.id = d.project_id
        where d.status = 'submitted' and (p.specialist_membership_id = any($1) or $2)`, [mine, roles.includes("grants_manager")]);
    for (const d of dels) out.push({ id: `del:${d.id}`, kind: "تسليم", title: d.label, entity: ref(ctx, { kind: "project", id: d.project_id, label: d.project_ref, orgId: d.association_id }), whatToDo: "راجع التسليم مع مطابقة مانح، ثم اقبله أو أعده.", due: null, tone: "active", href: `/staff/deliverables/${d.id}` });
    const frs = await ctx.tx.query<{ project_id: string; ref: string; association_id: string }>(
      `select f.project_id, p.ref, p.association_id from project.final_reports f join project.projects p on p.tenant_id = f.tenant_id and p.id = f.project_id where f.status = 'submitted' and (p.specialist_membership_id = any($1) or $2)`, [mine, roles.includes("grants_manager")]);
    for (const f of frs) out.push({ id: `fr:${f.project_id}`, kind: "تقرير ختامي", title: `التقرير الختامي — ${f.ref}`, entity: ref(ctx, { kind: "project", id: f.project_id, label: f.ref, orgId: f.association_id }), whatToDo: "راجع المنجز مقابل المخطط والمصروف مقابل الموازنة، ثم احكم.", due: null, tone: "active", href: `/staff/projects/${f.project_id}/final-report` });
    const ams = await ctx.tx.query<{ id: string; project_id: string; ref: string; association_id: string }>(
      `select a.id, a.project_id, p.ref, p.association_id from project.amendments a join project.projects p on p.tenant_id = a.tenant_id and p.id = a.project_id where a.status = 'submitted' and (p.specialist_membership_id = any($1) or $2)`, [mine, roles.includes("grants_manager")]);
    for (const a of ams) out.push({ id: `am:${a.id}`, kind: "طلب تعديل", title: `طلب تعديل — ${a.ref}`, entity: ref(ctx, { kind: "project", id: a.project_id, label: a.ref, orgId: a.association_id }), whatToDo: "اطلع على الفرق والأثر، ثم ارفعه إلى مسار الاعتماد.", due: null, tone: "active", href: `/staff/amendments/${a.id}` });
    const ret = await ctx.tx.query<{ id: string; ref: string; returned_reason: string; association_id: string }>(
      "select o.id, o.ref, o.returned_reason, o.association_id from finance.disbursement_orders o join project.projects p on p.tenant_id = o.tenant_id and p.id = o.project_id where o.status = 'returned' and o.returned_to = 'specialist' and (p.specialist_membership_id = any($1) or $2)", [mine, roles.includes("grants_manager")]);
    for (const o of ret) out.push({ id: `ret:${o.id}`, kind: "أمر صرف مُرجَع", title: o.ref, entity: ref(ctx, { kind: "disbursement", id: o.id, label: o.ref, orgId: o.association_id }), whatToDo: `صحّح ما ذكرته المالية: ${o.returned_reason}`, due: null, tone: "late", href: `/staff/finance/orders/${o.id}` });
  }
  if (roles.some((r) => ["grants_manager", "committee_secretary", "executive", "finance", "system_admin"].includes(r))) {
    for (const i of await awaitingMe(ctx)) {
      const lvl = approval.currentLevel(i.chain);
      if (i.subject_kind === "disbursement") {
        out.push({ id: `apr:${i.id}`, kind: "اعتماد صرف", title: `أمر صرف بمبلغ ${(i.amount_halalas / 100).toLocaleString("en-US")} ريال`, entity: ref(ctx, { kind: "disbursement", id: i.subject_id, label: "أمر صرف" }), whatToDo: `اعتمد أمر الصرف في مستوى ${lvl?.label} أو أعده.`, due: null, tone: "active", href: `/staff/finance/orders/${i.subject_id}` });
      } else if (i.subject_kind === "amendment") {
        out.push({ id: `apr:${i.id}`, kind: "اعتماد تعديل", title: "طلب تعديل", entity: ref(ctx, { kind: "amendment", id: i.subject_id, label: "طلب تعديل" }), whatToDo: `اعتمد طلب التعديل في مستوى ${lvl?.label}.`, due: null, tone: "active", href: `/staff/amendments/${i.subject_id}` });
      } else {
        out.push({ id: `apr:${i.id}`, kind: lvl?.committee ? "لجنة" : "اعتماد", title: i.title ?? "طلب", entity: ref(ctx, { kind: "application", id: i.subject_id, label: i.ref ?? "" }), whatToDo: lvl?.committee ? "ضمّه إلى ملف العرض على اللجنة، ثم أدخل القرار من المحضر." : `بانتظار اعتمادك في مستوى ${lvl?.label}: اعتمد أو أعد بملاحظات أو عدّل المبلغ.`, due: null, tone: "active", href: lvl?.committee ? "/staff/committee" : `/staff/applications/${i.subject_id}` });
      }
    }
  }
  if (roles.includes("finance")) {
    const ready = await ctx.tx.query<{ id: string; ref: string; amount_halalas: number; association_id: string }>("select id, ref, amount_halalas, association_id from finance.disbursement_orders where status = 'ready' order by created_at");
    for (const o of ready) out.push({ id: `exe:${o.id}`, kind: "تنفيذ صرف", title: `${o.ref} — ${(o.amount_halalas / 100).toLocaleString("en-US")} ريال`, entity: ref(ctx, { kind: "disbursement", id: o.id, label: o.ref, orgId: o.association_id }), whatToDo: "نفّذ التحويل وأرفق الإثبات، أو أرجع الأمر بسبب.", due: null, tone: "active", href: `/staff/finance/orders/${o.id}` });
    const banks = await ctx.tx.query<{ id: string; association_id: string; iban_last4: string }>("select id, association_id, iban_last4 from finance.bank_accounts where status = 'pending'");
    for (const b of banks) out.push({ id: `bank:${b.id}`, kind: "حساب بنكي", title: `حساب جديد ينتهي بـ ${b.iban_last4}`, entity: ref(ctx, { kind: "association", id: b.association_id, label: "الجمعية" }), whatToDo: "تحقق من شهادة الحساب وأقرّه، ولن تُصرف دفعة عليه قبل إقرارك.", due: null, tone: "active", href: `/staff/finance/banks` });
  }
  if (roles.includes("system_admin") || roles.includes("grants_manager")) {
    const letters = await ctx.tx.query<{ id: string; name: string }>("select id, name from org.associations where status = 'pending_review'");
    for (const l of letters) out.push({ id: `letter:${l.id}`, kind: "تسجيل بخطاب", title: l.name, entity: ref(ctx, { kind: "association", id: l.id, label: l.name }), whatToDo: "راجع الخطاب الرسمي واقبل التسجيل أو ارفضه.", due: null, tone: "active", href: `/staff/associations/${l.id}` });
  }
  const order = { late: 0, near: 1, active: 2, neutral: 3 };
  return out.sort((a, b) => order[a.tone] - order[b.tone] || (a.due ?? "9").localeCompare(b.due ?? "9"));
}

/** R-078: the grants manager's home; every number opens its list. */
export async function managerHome(ctx: Ctx) {
  const pipeline = await ctx.tx.query<{ status: cycle.ApplicationStatus; n: number }>("select status, count(*)::int as n from cycle.applications where status <> 'draft' group by status");
  const team = await ctx.tx.query<{ membership_id: string; person_id: string; name: string; open: number; late: number; absent: boolean }>(
    `select m.id as membership_id, p.id as person_id, p.full_name as name,
       (select count(*)::int from cycle.applications a where a.assignee_membership_id = m.id and a.status in ('submitted','in_review','awaiting_info','in_approval')) as open,
       (select count(*)::int from cycle.applications a where a.assignee_membership_id = m.id and a.status in ('submitted','in_review','awaiting_info') and a.due_at < now()) as late,
       (m.absent_from is not null and m.absent_from <= current_date and (m.absent_until is null or m.absent_until >= current_date)) as absent
     from iam.memberships m join iam.persons p on p.id = m.person_id where m.role = 'grants_specialist' and m.active order by p.full_name`);
  const money = await ctx.tx.maybe<{ allocated: number; reserved: number; disbursed: number; available: number }>(
    "select coalesce(sum(allocated_halalas),0)::bigint as allocated, coalesce(sum(reserved_halalas),0)::bigint as reserved, coalesce(sum(disbursed_halalas),0)::bigint as disbursed, coalesce(sum(available_halalas),0)::bigint as available from finance.balances");
  const approvedTotal = (await ctx.tx.one<{ s: number }>("select coalesce(sum(approved_halalas),0)::bigint as s from cycle.applications where decision = 'approved'")).s;
  return { pipeline, team, money: { approved: approvedTotal, disbursed: money?.disbursed ?? 0, available: money?.available ?? 0 }, awaiting: await awaitingMe(ctx), late: await listApplications(ctx, { late: true }) };
}

export type AppListRow = { id: string; ref: string; title: string; status: cycle.ApplicationStatus; association: EntityRefOut; program: string; requested_halalas: number; due_at: string | null; tone: string; assignee: string | null };
export async function listApplications(ctx: Ctx, f: { status?: string; late?: boolean; programId?: string; mine?: boolean; q?: string } = {}): Promise<AppListRow[]> {
  const cfg = (await currentVersion(ctx.tx)).config;
  const hol = await holidays(ctx.tx);
  const rows = await ctx.tx.query<{ id: string; ref: string; title: string; status: cycle.ApplicationStatus; association_id: string; association_name: string; program_id: string; requested_halalas: number; due_at: string | null; assignee_membership_id: string | null; assignee_name: string | null }>(
    `select a.id, a.ref, a.title, a.status, a.association_id, o.name as association_name, a.program_id, coalesce(a.requested_halalas,0)::bigint as requested_halalas, a.due_at, a.assignee_membership_id, p.full_name as assignee_name
       from cycle.applications a join org.associations o on o.tenant_id = a.tenant_id and o.id = a.association_id
       left join iam.memberships m on m.tenant_id = a.tenant_id and m.id = a.assignee_membership_id left join iam.persons p on p.id = m.person_id
      where a.status <> 'draft' and ($1::text is null or a.status = $1) and ($2::boolean is not true or (a.due_at < now() and a.status in ('submitted','in_review','awaiting_info','in_approval')))
        and ($3::text is null or a.program_id = $3) and ($4::uuid[] is null or a.assignee_membership_id = any($4))
        and ($5::text is null or app.normalize_ar(a.ref || ' ' || a.title || ' ' || o.name) like app.normalize_ar($5))
      order by a.submitted_at desc nulls last limit 200`,
    [f.status ?? null, f.late ?? null, f.programId ?? null, f.mine ? ctx.actor.grants.map((g) => g.membershipId) : null, f.q ? `%${f.q}%` : null]);
  return rows.map((r) => ({
    id: r.id, ref: r.ref, title: r.title, status: r.status, program: cfg.programs.find((p) => p.id === r.program_id)?.name ?? r.program_id,
    association: ref(ctx, { kind: "association", id: r.association_id, label: r.association_name, orgId: r.association_id }),
    requested_halalas: r.requested_halalas, due_at: r.due_at, tone: r.due_at && cycle.OPEN_STATUSES.includes(r.status) ? cycle.dueTone(new Date(r.due_at), ctx.now, hol) : "neutral", assignee: r.assignee_name,
  }));
}

/** R-080: the finance home. Payment data only (R-081). */
export async function financeHome(ctx: Ctx) {
  const rows = await ctx.tx.query<{ id: string; ref: string; status: string; amount_halalas: number; association_id: string; association_name: string; returned_reason: string | null; blockers: financeDomain.Blocker[]; created_at: string; project_ref: string }>(
    `select o.id, o.ref, o.status, o.amount_halalas, o.association_id, a.name as association_name, o.returned_reason, o.blockers, o.created_at, p.ref as project_ref
       from finance.disbursement_orders o join org.associations a on a.tenant_id = o.tenant_id and a.id = o.association_id join project.projects p on p.tenant_id = o.tenant_id and p.id = o.project_id
      order by o.created_at`);
  const upcoming = await ctx.tx.query<{ id: string; label: string; amount_halalas: number; project_ref: string; association_id: string; association_name: string; condition: string }>(
    `select i.id, i.label, i.amount_halalas, p.ref as project_ref, p.association_id, a.name as association_name, i.condition
       from finance.installments i join project.projects p on p.tenant_id = i.tenant_id and p.id = i.project_id join org.associations a on a.tenant_id = p.tenant_id and a.id = p.association_id
      where i.status = 'scheduled' order by p.ref, i.seq limit 50`);
  return {
    awaiting: rows.filter((r) => r.status === "ready" || r.status === "in_approval"),
    returned: rows.filter((r) => ["returned", "blocked", "suspended"].includes(r.status)),
    executed: rows.filter((r) => r.status === "executed"),
    upcoming,
  };
}

/** R-082: the executive home — decisions awaiting them, the money, the team; personal order kept per person. */
export async function executiveHome(ctx: Ctx) {
  const home = await managerHome(ctx);
  const pref = await ctx.tx.maybe<{ value: string[] }>("select value from kernel.preferences where person_id = auth.uid() and key = 'executive_home_order'");
  return { ...home, order: (pref?.value ?? ["decide", "money", "team"]) as Array<"decide" | "money" | "team"> };
}
export async function saveHomeOrder(ctx: Ctx, order: string[]) {
  await ctx.tx.query(
    "insert into kernel.preferences (tenant_id, person_id, key, value) values (app.tenant(), auth.uid(), 'executive_home_order', $1) on conflict (tenant_id, person_id, key) do update set value = excluded.value",
    [JSON.stringify(order)]);
}

/** R-099 / N-06: instant search by name or number, scoped by RLS (no result outside permission). */
export async function search(ctx: Ctx, q: string) {
  const pattern = searchPattern(q);
  if (!pattern) return [];
  const rows = await ctx.tx.query<{ entity_kind: string; entity_id: string; ref: string | null; title: string; subtitle: string | null; org_id: string | null }>(
    "select entity_kind, entity_id, ref, title, subtitle, org_id from kernel.search_index where norm like $1 order by (ref ilike $2) desc, updated_at desc limit 20",
    [pattern, `${q.trim()}%`]);
  return rows.map((r) => ref(ctx, { kind: r.entity_kind as "application", id: r.entity_id, label: r.title, ref: r.ref ?? undefined, orgId: r.org_id })).map((e, i) => ({ ...e, subtitle: rows[i]!.subtitle }));
}

/** R-096: the readable timeline for an entity. */
export async function activity(ctx: Ctx, kind: string, id: string) {
  return ctx.tx.query<{ id: number; at: string; actor_label: string | null; text_key: string; params: Record<string, unknown>; ai: boolean }>(
    "select id, at, actor_label, text_key, params, ai from kernel.activity where entity_kind = $1 and entity_id = $2 order by at desc limit 100", [kind, id]);
}

/** R-089: the decision rationale on one page — version, scores, recommendations, approvers, minutes. */
export async function rationale(ctx: Ctx, applicationId: string) {
  authorize(ctx, "application.read", { applicationId });
  const app = await ctx.tx.one<{ id: string; ref: string; title: string; decision: string | null; decided_at: string | null; approved_halalas: number | null; framework_version_id: string; program_id: string; association_id: string }>(
    "select id, ref, title, decision, decided_at, approved_halalas, framework_version_id, program_id, association_id from cycle.applications where id = $1", [applicationId]);
  const ver = await versionConfig(ctx.tx, app.framework_version_id);
  const p = programOf(ver.config, app.program_id);
  const sf = await ctx.tx.maybe<{ scores: Record<string, number>; recommendation: string | null; recommended_halalas: number | null; rationale: string | null; judged_by_name: string | null; judged_at: string | null }>(
    "select s.scores, s.recommendation, s.recommended_halalas, s.rationale, p.full_name as judged_by_name, s.judged_at from cycle.study_files s left join iam.persons p on p.id = s.judged_by where s.application_id = $1", [applicationId]);
  const ai = await latestOutput(ctx, applicationId, "application.study_file");
  const sealed = ai?.sealed as { scores?: Array<{ criterion: string; score: number }>; recommendation?: { decision: string; amount_halalas: number; rationale: string } } | null;
  const actions = await ctx.tx.query<{ level_key: string; action: string; note: string | null; at: string; name: string; meeting_id: string | null; amount_halalas: number | null }>(
    `select x.level_key, x.action, x.note, x.at, p.full_name as name, x.meeting_id, x.amount_halalas from approval.actions x join approval.instances i on i.tenant_id = x.tenant_id and i.id = x.instance_id
       join iam.persons p on p.id = x.actor where i.subject_kind = 'application' and i.subject_id = $1 order by x.at`, [applicationId]);
  const chain = ver.config.approvalChains.find((c) => c.id === p.approvalChainId);
  const meetingId = actions.find((a) => a.meeting_id)?.meeting_id;
  const meeting = meetingId ? await ctx.tx.maybe<{ title: string; held_on: string; minutes_file_id: string | null }>("select title, to_char(held_on,'YYYY-MM-DD') as held_on, minutes_file_id from approval.committee_meetings where id = $1", [meetingId]) : null;
  return {
    app, version: ver.number, criteria: p.criteria,
    scores: p.criteria.map((c) => ({ criterion: c.name, key: c.key, weight: c.weight, manih: sealed?.scores?.find((s) => s.criterion === c.key)?.score ?? null, human: sf?.scores?.[c.key] ?? null })),
    recommendations: [
      ...(sealed?.recommendation ? [{ by: "مانح", ai: true, text: `${sealed.recommendation.rationale} (${(sealed.recommendation.amount_halalas / 100).toLocaleString("en-US")} ريال)` }] : []),
      ...(sf?.recommendation ? [{ by: sf.judged_by_name ?? "", ai: false, text: `${sf.rationale ?? ""} (${((sf.recommended_halalas ?? 0) / 100).toLocaleString("en-US")} ريال)` }] : []),
    ],
    approvers: actions.map((a) => ({ level: chain?.levels.find((l) => l.key === a.level_key)?.label ?? a.level_key, by: a.name, action: a.action, at: a.at, note: a.note })),
    meeting,
  };
}

export async function viewerCan(ctx: Ctx, action: iam.Action, resource: Omit<iam.Resource, "tenantId">) {
  return iam.can(ctx.actor, action, { tenantId: ctx.actor.tenantId, ...resource });
}

export { awaitsActor, framework, type Halalas };
