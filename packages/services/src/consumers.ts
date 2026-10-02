import { OFFICIAL_EVENTS, render, TEMPLATES, type EventType } from "@wbl/kernel";
import type { Ctx } from "./context";
import { submitPending } from "./ai";
import { tryClose } from "./project";

/**
 * Outbox consumers (architecture §7). Each receives one event in a session
 * scoped to that event's tenant. The worker records (event, consumer) in
 * kernel.outbox_deliveries in the SAME transaction, so a consumer's effects
 * happen at most once per event.
 */
export type OutboxEvent = { id: number; event_type: EventType; entity_kind: string | null; entity_id: string | null; actor: string | null; payload: Record<string, unknown>; created_at: string };

export const CONSUMERS = ["activity", "notifications", "manih_submit", "usage", "project_closure"] as const;
export type ConsumerName = (typeof CONSUMERS)[number];

const ACTIVITY: Partial<Record<EventType, string>> = {
  "application.submitted": "قدّمت الجمعية الطلب {ref}", "application.assigned": "أُسند الطلب", "application.reassigned": "نُقل الطلب. السبب: {reason}",
  "application.info_requested": "طُلب استكمال من الجمعية", "application.info_answered": "استكملت الجمعية الطلب", "application.withdrawn": "سحبت الجمعية الطلب",
  "application.recommended": "رُفعت التوصية إلى مسار الاعتماد", "application.coi_declared": "صُرّح بتعارض مصالح",
  "study_file.ready": "جهّز مانح ملف الدراسة", "assessment.recorded": "سجّل الأخصائي تقييمه المستقل", "approval.acted": "إجراء في مسار الاعتماد: {level}",
  "grant.decided": "صدر القرار: {decision}", "agreement.issued": "صدرت الاتفاقية {ref}", "agreement.association_signed": "رفعت الجمعية الاتفاقية الموقعة",
  "agreement.fully_signed": "اكتمل التوقيعان وأُنشئ المشروع {project}", "project.created": "أُنشئ المشروع", "deliverable.submitted": "رُفع التسليم «{label}»",
  "deliverable.accepted": "قُبل التسليم «{label}»", "deliverable.returned": "أُعيد التسليم «{label}»", "deliverable.overdue": "تأخر التسليم «{label}»",
  "disbursement.ordered": "فُتح أمر الصرف {ref}", "disbursement.blocked": "أمر الصرف {ref} موقوف بمانع", "disbursement.executed": "نُفّذ صرف {amount}",
  "disbursement.returned": "أُرجع أمر الصرف {ref}", "project.suspended": "عُلّق المشروع: {reason}", "project.resumed": "استؤنف المشروع",
  "amendment.requested": "طُلب تعديل", "amendment.decided": "قرار التعديل: {decision}", "final_report.submitted": "رُفع التقرير الختامي",
  "final_report.decided": "قرار التقرير الختامي", "project.closed": "أُقفل المشروع", "association.registered": "سُجّلت الجمعية",
  "association.suspended": "أُوقفت تعاملات الجمعية: {reason}", "association.reinstated": "رُفع إيقاف التعاملات", "org_document.confirmed": "أُكدت وثيقة",
  "receipt.overdue": "تأخر مستند استلام {ref}", "bank_account.change_requested": "طُلب تغيير الحساب البنكي", "bank_account.acknowledged": "أقرت المالية الحساب البنكي",
};

const fill = (s: string, p: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(p[k] ?? ""));

export async function consume(ctx: Ctx, consumer: ConsumerName, e: OutboxEvent) {
  switch (consumer) {
    case "activity": return activity(ctx, e);
    case "notifications": return notifications(ctx, e);
    case "manih_submit": if (e.event_type === "ai.task_requested") await submitPending(ctx, String(e.payload.ai_output_id)); return;
    case "usage":
      // R-084: consumption from day one — submitted applications and completed (closed) grants.
      if (e.event_type === "application.submitted") await ctx.tx.query("insert into platform.usage_events (tenant_id, kind, ref_id) values (app.tenant(), 'application.submitted', $1) on conflict do nothing", [e.entity_id]);
      if (e.event_type === "project.closed") await ctx.tx.query("insert into platform.usage_events (tenant_id, kind, ref_id) values (app.tenant(), 'application.completed', $1) on conflict do nothing", [e.entity_id]);
      return;
    case "project_closure":
      // R-073: the project module reacts to finance's event (invariant 12) — the last executed
      // payment of a project in «closing» closes it; tryClose re-checks every condition itself.
      if (e.event_type === "disbursement.executed" && e.payload.project_id) {
        const p = await ctx.tx.maybe<{ status: string }>("select status from project.projects where id = $1", [e.payload.project_id]);
        if (p?.status === "closing") await tryClose(ctx, String(e.payload.project_id));
      }
      return;
  }
}

async function activity(ctx: Ctx, e: OutboxEvent) {
  const text = ACTIVITY[e.event_type];
  if (!text || !e.entity_id || !e.entity_kind) return;
  const actor = e.actor ? await ctx.tx.maybe<{ full_name: string }>("select full_name from iam.persons where id = $1", [e.actor]) : null;
  const ai = e.event_type === "study_file.ready";
  const rows: Array<[string, string]> = [[e.entity_kind, e.entity_id]];
  // Project events also appear on the association's page.
  if (e.payload.org_id && e.entity_kind !== "association") rows.push(["association", String(e.payload.org_id)]);
  for (const [kind, id] of rows) {
    await ctx.tx.query(
      "insert into kernel.activity (tenant_id, entity_kind, entity_id, actor, actor_label, text_key, params, ai, at, event_id) values (app.tenant(), $1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict do nothing",
      [kind, id, e.actor, ai ? "مانح" : actor?.full_name ?? "النظام", fill(text, e.payload), JSON.stringify({ ...e.payload, event: e.event_type }), ai, e.created_at, e.id]);
  }
}

/** R-102 in-app + email; R-094 the association's official email for the essential events; R-103 WhatsApp for reminders. */
async function notifications(ctx: Ctx, e: OutboxEvent) {
  const tpl = TEMPLATES[e.event_type];
  if (!tpl) return;
  const params = { ...e.payload };
  if (e.event_type === "application.reassigned") {
    const names = await ctx.tx.query<{ id: string; full_name: string }>("select m.id, p.full_name from iam.memberships m join iam.persons p on p.id = m.person_id where m.id = any($1)", [[e.payload.from_membership, e.payload.to_membership].filter(Boolean)]);
    params.from = names.find((n) => n.id === e.payload.from_membership)?.full_name ?? "—";
    params.to = names.find((n) => n.id === e.payload.to_membership)?.full_name ?? "—";
  }
  const msg = render(tpl, params);
  const recipients = new Set<string>();

  // Staff recipients.
  const staffMembership = (id: unknown) => id ? ctx.tx.maybe<{ person_id: string }>("select person_id from iam.memberships where id = $1", [id]) : Promise.resolve(null);
  if (e.event_type === "application.assigned" || e.event_type === "sla.breached") { const m = await staffMembership(e.payload.membership_id); if (m) recipients.add(m.person_id); }
  if (e.event_type === "application.reassigned") {
    for (const k of ["from_membership", "to_membership"]) { const m = await staffMembership(e.payload[k]); if (m) recipients.add(m.person_id); }   // R-090: both parties
  }
  if (e.event_type === "study_file.ready" || e.event_type === "application.info_answered") {
    const a = await ctx.tx.maybe<{ person_id: string; ref: string; title: string }>("select m.person_id, a.ref, a.title from cycle.applications a join iam.memberships m on m.tenant_id = a.tenant_id and m.id = a.assignee_membership_id where a.id = $1", [e.entity_id]);
    if (a) { recipients.add(a.person_id); Object.assign(params, { ref: a.ref, title: a.title }); }
  }
  if (e.event_type === "approval.opened" && e.payload.awaiting_role) {
    const ppl = await ctx.tx.query<{ person_id: string }>("select person_id from iam.memberships where role = $1 and active", [e.payload.awaiting_role]);
    ppl.forEach((p) => recipients.add(p.person_id));
    const a = e.entity_kind === "application" ? await ctx.tx.maybe<{ ref: string; title: string }>("select ref, title from cycle.applications where id = $1", [e.entity_id]) : null;
    if (a) Object.assign(params, a);
  }
  if (e.event_type === "deliverable.overdue" || e.event_type === "sla.breached") {          // R-054: escalate to the grants manager
    const ppl = await ctx.tx.query<{ person_id: string }>("select person_id from iam.memberships where role = 'grants_manager' and active");
    ppl.forEach((p) => recipients.add(p.person_id));
  }
  if (e.event_type === "bank_account.change_requested") {
    const ppl = await ctx.tx.query<{ person_id: string }>("select person_id from iam.memberships where role = 'finance' and active");
    ppl.forEach((p) => recipients.add(p.person_id));
  }
  // Association users.
  const orgId = e.payload.org_id as string | undefined;
  if (orgId && ["application.submitted", "application.info_requested", "grant.decided", "agreement.issued", "agreement.fully_signed", "deliverable.reminder", "deliverable.overdue", "deliverable.accepted", "deliverable.returned", "disbursement.executed", "disbursement.returned", "receipt.overdue", "association.suspended", "org_document.expiring", "bank_account.change_requested", "bank_account.acknowledged", "amendment.decided"].includes(e.event_type)) {
    const ppl = await ctx.tx.query<{ person_id: string }>("select person_id from iam.memberships where org_id = $1 and active", [orgId]);
    ppl.forEach((p) => recipients.add(p.person_id));
  }
  const rendered = render(tpl, params);
  for (const person of recipients) {
    await ctx.tx.query(
      "insert into kernel.notifications (tenant_id, recipient_person, channel, template, params, status, event_id) values (app.tenant(), $1, 'in_app', $2, $3, 'sent', $4) on conflict do nothing",
      [person, e.event_type, JSON.stringify({ subject: rendered.subject, body: rendered.body, entity_kind: e.entity_kind, entity_id: e.entity_id }), e.id]);
    const p = await ctx.tx.maybe<{ email: string | null }>("select email from iam.persons where id = $1", [person]);
    if (p?.email) await ctx.adapters.email.send({ to: p.email, subject: rendered.subject, text: rendered.body });
  }
  // R-094: the official email gets every essential event, regardless of who the users are.
  if (orgId && OFFICIAL_EVENTS.includes(e.event_type)) {
    const a = await ctx.tx.maybe<{ official_email: string | null; official_phone: string | null }>("select official_email, official_phone from org.associations where id = $1", [orgId]);
    if (a?.official_email) {
      await ctx.tx.query(
        "insert into kernel.notifications (tenant_id, recipient_address, channel, template, params, official, status, event_id, sent_at) values (app.tenant(), $1, 'email', $2, $3, true, 'sent', $4, now()) on conflict do nothing",
        [a.official_email, e.event_type, JSON.stringify(rendered), e.id]);
      await ctx.adapters.email.send({ to: a.official_email, subject: rendered.subject, text: rendered.body });
    }
    // R-103: reminders and urgent items also go by WhatsApp through approved templates.
    const cfg = await ctx.tx.maybe<{ snapshot: { settings: { reminderChannel: string } } }>("select snapshot from framework.current_version");
    if (tpl.whatsappTemplate && a?.official_phone && cfg?.snapshot.settings.reminderChannel === "whatsapp") {
      await ctx.tx.query(
        "insert into kernel.notifications (tenant_id, recipient_address, channel, template, params, official, status, event_id, sent_at) values (app.tenant(), $1, 'whatsapp', $2, $3, true, 'sent', $4, now()) on conflict do nothing",
        [a.official_phone, tpl.whatsappTemplate, JSON.stringify(rendered), e.id]);
      await ctx.adapters.whatsapp.sendTemplate(a.official_phone, tpl.whatsappTemplate, Object.values(params).filter((v) => typeof v === "string").slice(0, 3) as string[]);
    }
  }
  void msg;
}
