import { cycle, project } from "@wbl/domain";
import { holidays, riyadhToday, currentVersion, type Ctx } from "./context";
import { recheckOrder } from "./finance";
import { settleResult } from "./ai";

/**
 * Scheduled sweeps (pg_cron calls kernel jobs in production; the worker runs
 * them per tenant here). Each runs as the system actor scoped to ONE tenant
 * and is idempotent: running it twice does nothing the second time.
 */

/** R-044: entering a state set due_at; crossing it emits sla.breached once. */
export async function slaBreaches(ctx: Ctx) {
  const rows = await ctx.tx.query<{ id: string; ref: string; title: string; status: string; assignee_membership_id: string | null }>(
    "update cycle.applications set sla_breached_at = now(), version = version + 1 where due_at < now() and sla_breached_at is null and status = any($1) returning id, ref, title, status, assignee_membership_id",
    [cycle.SLA_STATUSES]);
  for (const r of rows) {
    await ctx.tx.emit({ type: "sla.breached", entityKind: "application", entityId: r.id, payload: { ref: r.ref, title: r.title, stage: cycle.STATUS_LABEL[r.status as cycle.ApplicationStatus], membership_id: r.assignee_membership_id } });
  }
  return rows.length;
}

/** R-017 + R-069: remind before expiry; on the day, readiness drops and essential documents suspend disbursement. */
export async function documentExpiry(ctx: Ctx) {
  const cfg = (await currentVersion(ctx.tx)).config;
  const today = riyadhToday(ctx.now);
  const days = cfg.settings.readiness.nearExpiryDays;
  const due = await ctx.tx.query<{ id: string; association_id: string; doc_type: string; expiry_date: string }>(
    `update org.documents set reminder_sent_at = now() where status = 'confirmed' and reminder_sent_at is null and expiry_date > $1::date and expiry_date <= $1::date + $2::int
     returning id, association_id, doc_type, to_char(expiry_date, 'YYYY-MM-DD') as expiry_date`, [today, days]);
  for (const d of due) {
    await ctx.tx.emit({ type: "org_document.expiring", entityKind: "association", entityId: d.association_id, payload: { doc: cfg.documentTypes.find((x) => x.key === d.doc_type)?.label ?? d.doc_type, date: d.expiry_date, org_id: d.association_id } });
  }
  // Essential documents expired (no valid replacement): suspend open orders and active projects.
  const essential = cfg.settings.readiness.essentialDocuments;
  const affected = await ctx.tx.query<{ association_id: string }>(
    `select distinct a.id as association_id from org.associations a
      where exists (select 1 from unnest($2::text[]) t(doc_type)
        where not exists (select 1 from org.documents d where d.association_id = a.id and d.doc_type = t.doc_type and d.status = 'confirmed' and (d.expiry_date is null or d.expiry_date >= $1::date)))`,
    [today, essential]);
  let suspended = 0;
  for (const { association_id } of affected) {
    const projects = await ctx.tx.query<{ id: string }>(
      "update project.projects set status = 'suspended', suspended_at = now(), suspended_reason = 'وثيقة جوهرية منتهية', version = version + 1 where association_id = $1 and status = 'active' returning id", [association_id]);
    for (const p of projects) await ctx.tx.emit({ type: "project.suspended", entityKind: "project", entityId: p.id, payload: { reason: "وثيقة جوهرية منتهية", org_id: association_id } });
    const orders = await ctx.tx.query<{ id: string; ref: string }>(
      "update finance.disbursement_orders set status = 'suspended', version = version + 1 where association_id = $1 and status in ('ready','in_approval','blocked') returning id, ref", [association_id]);
    for (const o of orders) await ctx.tx.emit({ type: "disbursement.suspended", entityKind: "disbursement", entityId: o.id, payload: { ref: o.ref, org_id: association_id } });
    suspended += projects.length + orders.length;
  }
  return { reminded: due.length, suspended };
}

/** R-069: once the documents are valid again, everything suspended resumes by itself; suspension days are not delay. */
export async function resumeSuspended(ctx: Ctx) {
  const cfg = (await currentVersion(ctx.tx)).config;
  const today = riyadhToday(ctx.now);
  const ok = await ctx.tx.query<{ id: string }>(
    `select a.id from org.associations a where a.status = 'active' and not exists (select 1 from unnest($2::text[]) t(doc_type)
      where not exists (select 1 from org.documents d where d.association_id = a.id and d.doc_type = t.doc_type and d.status = 'confirmed' and (d.expiry_date is null or d.expiry_date >= $1::date)))`,
    [today, cfg.settings.readiness.essentialDocuments]);
  let resumed = 0;
  for (const { id } of ok) {
    const projects = await ctx.tx.query<{ id: string; suspended_at: string }>("select id, suspended_at from project.projects where association_id = $1 and status = 'suspended' and suspended_reason = 'وثيقة جوهرية منتهية'", [id]);
    for (const p of projects) {
      const days = cycle.businessDaysBetween(new Date(p.suspended_at), ctx.now, await holidays(ctx.tx));
      // Push pending deliverables by the suspended business days so suspension never counts as delay.
      await ctx.tx.query("update project.deliverables set due_date = due_date + $2::int, version = version + 1 where project_id = $1 and status in ('pending','returned')", [p.id, Math.ceil(days * 7 / 5)]);
      await ctx.tx.query("update project.projects set status = 'active', suspended_days = suspended_days + $2, suspended_at = null, suspended_reason = null, version = version + 1 where id = $1", [p.id, days]);
      await ctx.tx.emit({ type: "project.resumed", entityKind: "project", entityId: p.id, payload: { org_id: id, days } });
      resumed++;
    }
    const orders = await ctx.tx.query<{ id: string; ref: string; had: boolean }>(
      `update finance.disbursement_orders o set status = case when exists (select 1 from approval.instances i where i.subject_id = o.id and i.status = 'approved') then 'ready' else 'pending_checks' end, version = version + 1
        where association_id = $1 and status = 'suspended' returning id, ref, true as had`, [id]);
    for (const o of orders) {
      const s = await recheckOrder(ctx, o.id);
      await ctx.tx.emit({ type: "disbursement.resumed", entityKind: "disbursement", entityId: o.id, payload: { ref: o.ref, status: s, org_id: id } });
      resumed++;
    }
    // Blocked orders whose blockers are gone move on too.
    const blocked = await ctx.tx.query<{ id: string }>("select id from finance.disbursement_orders where association_id = $1 and status = 'blocked'", [id]);
    for (const b of blocked) await recheckOrder(ctx, b.id);
  }
  return resumed;
}

/** R-051 / R-054: deliverable reminders before the due date, escalation after it (manager + official email). */
export async function deliverableAlerts(ctx: Ctx) {
  const cfg = (await currentVersion(ctx.tx)).config;
  const today = riyadhToday(ctx.now);
  const rows = await ctx.tx.query<{ id: string; project_id: string; label: string; due_date: string; status: project.DeliverableStatus; reminder_sent_at: string | null; escalated_at: string | null; association_id: string; project_status: string }>(
    `select d.id, d.project_id, d.label, to_char(d.due_date, 'YYYY-MM-DD') as due_date, d.status, d.reminder_sent_at, d.escalated_at, p.association_id, p.status as project_status
       from project.deliverables d join project.projects p on p.tenant_id = d.tenant_id and p.id = d.project_id where d.status in ('pending','returned')`);
  let n = 0;
  for (const d of rows) {
    if (d.project_status === "suspended") continue;          // R-069: suspended time is not delay
    for (const a of project.deliverableAlerts(d.due_date, today, cfg.settings.sla.deliverableReminderDays, d.status, !!d.reminder_sent_at, !!d.escalated_at)) {
      if (a === "remind") {
        await ctx.tx.query("update project.deliverables set reminder_sent_at = now(), version = version + 1 where id = $1", [d.id]);
        await ctx.tx.emit({ type: "deliverable.reminder", entityKind: "project", entityId: d.project_id, payload: { label: d.label, due: d.due_date, org_id: d.association_id, deliverable_id: d.id } });
      } else {
        await ctx.tx.query("update project.deliverables set escalated_at = now(), version = version + 1 where id = $1", [d.id]);
        await ctx.tx.emit({ type: "deliverable.overdue", entityKind: "project", entityId: d.project_id, payload: { label: d.label, due: d.due_date, org_id: d.association_id, deliverable_id: d.id } });
      }
      n++;
    }
  }
  return n;
}

/** R-067: a receipt not uploaded in time escalates and suspends the association's dealings; uploading it lifts the suspension. */
export async function receipts(ctx: Ctx) {
  const overdue = await ctx.tx.query<{ id: string; ref: string; association_id: string }>(
    "select id, ref, association_id from finance.disbursement_orders where status = 'executed' and receipt_received_at is null and receipt_due_at < now()");
  let suspended = 0;
  for (const o of overdue) {
    const r = await ctx.tx.query("update org.associations set status = 'suspended', suspended_reason = $2 where id = $1 and status = 'active' returning id", [o.association_id, `مستند استلام الدفعة ${o.ref} متأخر`]);
    if (r.length) {
      suspended++;
      await ctx.tx.emit({ type: "receipt.overdue", entityKind: "disbursement", entityId: o.id, payload: { ref: o.ref, org_id: o.association_id } });
      await ctx.tx.emit({ type: "association.suspended", entityKind: "association", entityId: o.association_id, payload: { reason: `مستند استلام الدفعة ${o.ref} متأخر`, org_id: o.association_id } });
    }
  }
  const lift = await ctx.tx.query<{ id: string }>(
    `update org.associations a set status = 'active', suspended_reason = null where a.status = 'suspended' and a.suspended_reason like 'مستند استلام%'
       and not exists (select 1 from finance.disbursement_orders o where o.association_id = a.id and o.status = 'executed' and o.receipt_received_at is null and o.receipt_due_at < now())
     returning a.id`);
  for (const a of lift) await ctx.tx.emit({ type: "association.reinstated", entityKind: "association", entityId: a.id, payload: { org_id: a.id } });
  return { suspended, lifted: lift.length };
}

/** R-058: an amendment awaiting the signatory past its deadline lapses (it never takes effect silently). */
export async function signatoryDeadlines(ctx: Ctx) {
  const rows = await ctx.tx.query<{ id: string; project_id: string }>(
    "update project.amendments set status = 'expired', decided_at = now(), version = version + 1 where status = 'awaiting_signatory' and signatory_due_at < now() returning id, project_id");
  for (const r of rows) await ctx.tx.emit({ type: "amendment.decided", entityKind: "project", entityId: r.project_id, payload: { amendment_id: r.id, decision: "انقضت مهلة صاحب الصلاحية دون رد" } });
  return rows.length;
}

/** Polling fallback (§3 GET /tasks/{id}) for results whose webhook never arrived. */
export async function pollManih(ctx: Ctx) {
  const rows = await ctx.tx.query<{ manih_task_id: string }>("select manih_task_id from cycle.ai_outputs where status = 'pending' and manih_task_id is not null and created_at < now() - interval '2 minutes' limit 20");
  let n = 0;
  for (const r of rows) {
    const res = await ctx.adapters.manih.get(r.manih_task_id);
    if ("task_id" in res) { await settleResult(ctx, res); n++; }
  }
  return n;
}

export async function runAll(ctx: Ctx) {
  return {
    sla: await slaBreaches(ctx),
    documents: await documentExpiry(ctx),
    resumed: await resumeSuspended(ctx),
    deliverables: await deliverableAlerts(ctx),
    receipts: await receipts(ctx),
    signatory: await signatoryDeadlines(ctx),
  };
}
