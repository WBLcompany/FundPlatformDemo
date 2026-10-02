import { randomUUID } from "node:crypto";
import { cycle, DomainError, finance } from "@wbl/domain";
import { authorize, holidays, programOf, riyadhToday, versionConfig, type Ctx } from "./context";
import { openInstance } from "./approval";

type OrderRow = { id: string; ref: string; installment_id: string; project_id: string; association_id: string; account_id: string; amount_halalas: number; bank_account_id: string | null; status: string; blockers: finance.Blocker[]; version: number; returned_reason: string | null; returned_to: string | null; receipt_due_at: string | null; executed_at: string | null; finance_ref: string | null };
const COLS = "id, ref, installment_id, project_id, association_id, account_id, amount_halalas, bank_account_id, status, blockers, version, returned_reason, returned_to, receipt_due_at, executed_at, finance_ref";

export async function getOrder(ctx: Ctx, id: string): Promise<OrderRow> {
  return ctx.tx.one<OrderRow>(`select ${COLS} from finance.disbursement_orders where id = $1`, [id]);
}

/** R-063: the blockers, computed from facts the database holds. */
export async function computeBlockers(ctx: Ctx, associationId: string, projectId: string): Promise<{ blockers: finance.Blocker[]; bankAccountId: string | null }> {
  const pr = await ctx.tx.one<{ framework_version_id: string; status: string }>("select framework_version_id, status from project.projects where id = $1", [projectId]);
  const cfg = (await versionConfig(ctx.tx, pr.framework_version_id)).config;
  const a = await ctx.tx.one<{ status: string }>("select status from org.associations where id = $1", [associationId]);
  const docs = await ctx.tx.query<{ doc_type: string; expiry_date: string | null }>(
    "select doc_type, to_char(expiry_date, 'YYYY-MM-DD') as expiry_date from org.documents where association_id = $1 and status = 'confirmed'", [associationId]);
  const today = riyadhToday(ctx.now);
  const expired = cfg.settings.readiness.essentialDocuments.filter((t) => {
    const d = docs.filter((x) => x.doc_type === t);
    return !d.some((x) => cycle.documentState(x.expiry_date, today) !== "expired");
  }).map((t) => cfg.documentTypes.find((d) => d.key === t)?.label ?? t);
  const bank = await ctx.tx.maybe<{ id: string }>("select id from finance.bank_accounts where association_id = $1 and status = 'acknowledged'", [associationId]);
  const receiptOverdue = await ctx.tx.one<{ n: number }>("select count(*)::int as n from finance.disbursement_orders where association_id = $1 and status = 'executed' and receipt_received_at is null and receipt_due_at < now()", [associationId]);
  return {
    blockers: finance.disbursementBlockers({ associationSuspended: a.status === "suspended", essentialDocsExpired: expired, bankAccountAcknowledged: !!bank, projectSuspended: pr.status === "suspended", priorReceiptOverdue: receiptOverdue.n > 0 }),
    bankAccountId: bank?.id ?? null,
  };
}

/** R-053: an installment whose condition is met opens its order; blockers decide whether it is executable. */
export async function createOrderForInstallment(ctx: Ctx, installmentId: string): Promise<string> {
  const inst = await ctx.tx.one<{ id: string; project_id: string; amount_halalas: number; status: string; label: string }>("select id, project_id, amount_halalas, status, label from finance.installments where id = $1", [installmentId]);
  const existing = await ctx.tx.maybe<{ id: string }>("select id from finance.disbursement_orders where installment_id = $1", [installmentId]);
  if (existing) return existing.id;
  const pr = await ctx.tx.one<{ association_id: string; framework_version_id: string; program_id: string }>("select association_id, framework_version_id, program_id from project.projects where id = $1", [inst.project_id]);
  const cfg = (await versionConfig(ctx.tx, pr.framework_version_id)).config;
  const accountName = cfg.budgetAccounts.find((a) => a.key === programOf(cfg, pr.program_id).budgetAccount)!.name;
  const acct = await ctx.tx.one<{ id: string }>("select id from finance.budget_accounts where name = $1", [accountName]);
  const { blockers, bankAccountId } = await computeBlockers(ctx, pr.association_id, inst.project_id);
  const ref = (await ctx.tx.one<{ next_ref: string }>("select cycle.next_ref('disbursement', 'أص')")).next_ref;
  const id = randomUUID();
  await ctx.tx.query(
    `insert into finance.disbursement_orders (tenant_id, id, ref, installment_id, project_id, association_id, account_id, amount_halalas, bank_account_id, status, blockers)
     values (app.tenant(), $1, $2, $3, $4, $5, $6, $7, $8, 'pending_checks', $9)`,
    [id, ref, installmentId, inst.project_id, pr.association_id, acct.id, inst.amount_halalas, bankAccountId, JSON.stringify(blockers)]);
  await ctx.tx.query("update finance.installments set status = 'ordered' where id = $1", [installmentId]);
  await ctx.tx.emit({ type: "disbursement.ordered", entityKind: "project", entityId: inst.project_id, payload: { order_id: id, ref, label: inst.label, org_id: pr.association_id } });
  if (blockers.length) {
    await setOrderStatus(ctx, id, "blocked", { blockers: JSON.stringify(blockers) });
    await ctx.tx.emit({ type: "disbursement.blocked", entityKind: "disbursement", entityId: id, payload: { ref, blockers: blockers.map((b) => b.label), org_id: pr.association_id } });
  } else {
    await openInstance(ctx, "disbursement", id, cfg.disbursementChain, { amountHalalas: inst.amount_halalas }, pr.framework_version_id);
    await setOrderStatus(ctx, id, "in_approval");
  }
  return id;
}

async function setOrderStatus(ctx: Ctx, id: string, status: string, extra: Record<string, unknown> = {}) {
  const o = await ctx.tx.one<{ version: number }>("select version from finance.disbursement_orders where id = $1", [id]);
  const sets = ["status = $3", "version = version + 1"];
  const params: unknown[] = [id, o.version, status];
  for (const [k, v] of Object.entries(extra)) { params.push(v); sets.push(`${k} = $${params.length}`); }
  const r = await ctx.tx.query(`update finance.disbursement_orders set ${sets.join(", ")} where id = $1 and version = $2 returning id`, params);
  if (!r.length) throw new DomainError("stale_version", "تغيّر أمر الصرف. أعد التحميل.");
}

/** Re-runs the blockers on a blocked order (after a document renewal or an acknowledgement). */
export async function recheckOrder(ctx: Ctx, id: string) {
  const o = await getOrder(ctx, id);
  if (o.status !== "blocked" && o.status !== "pending_checks") return o.status;
  const { blockers, bankAccountId } = await computeBlockers(ctx, o.association_id, o.project_id);
  if (blockers.length) { await ctx.tx.query("update finance.disbursement_orders set blockers = $2, bank_account_id = $3 where id = $1", [id, JSON.stringify(blockers), bankAccountId]); return "blocked"; }
  const pr = await ctx.tx.one<{ framework_version_id: string }>("select framework_version_id from project.projects where id = $1", [o.project_id]);
  const cfg = (await versionConfig(ctx.tx, pr.framework_version_id)).config;
  await setOrderStatus(ctx, id, "pending_checks", { blockers: "[]", bank_account_id: bankAccountId });
  await openInstance(ctx, "disbursement", id, cfg.disbursementChain, { amountHalalas: o.amount_halalas }, pr.framework_version_id);
  await setOrderStatus(ctx, id, "in_approval");
  return "in_approval";
}

export async function onDisbursementApproval(ctx: Ctx, orderId: string, outcome: "approved" | "rejected" | "returned", note: string | null) {
  const o = await getOrder(ctx, orderId);
  if (outcome === "approved") {
    await setOrderStatus(ctx, orderId, "ready");
    await ctx.tx.emit({ type: "disbursement.ready", entityKind: "disbursement", entityId: orderId, payload: { ref: o.ref, org_id: o.association_id } });
  } else {
    await setOrderStatus(ctx, orderId, "returned", { returned_reason: note ?? "أُعيد من سلسلة الاعتماد", returned_to: "specialist" });
    await ctx.tx.emit({ type: "disbursement.returned", entityKind: "disbursement", entityId: orderId, payload: { ref: o.ref, reason: note, org_id: o.association_id } });
  }
}

/** R-065 / R-066 / R-068: finance executes with proof and a finance-system reference; the association is told the amount and account. */
export async function execute(ctx: Ctx, orderId: string, input: { proofFileId: string; financeRef: string | null }) {
  authorize(ctx, "disbursement.execute", {});
  const o = await getOrder(ctx, orderId);
  if (o.status !== "ready") throw new DomainError("not_ready", "الأمر ليس بانتظار التنفيذ");
  const { blockers } = await computeBlockers(ctx, o.association_id, o.project_id);
  if (blockers.length) throw new DomainError("blocked", blockers.map((b) => b.label).join("، "));
  const pr = await ctx.tx.one<{ framework_version_id: string }>("select framework_version_id from project.projects where id = $1", [o.project_id]);
  const cfg = (await versionConfig(ctx.tx, pr.framework_version_id)).config;
  const receiptDue = cycle.addBusinessDays(ctx.now, cfg.settings.sla.receiptDays, await holidays(ctx.tx));
  await ctx.tx.query("select finance.post($1, 'disbursement', $2, 'disbursement', $3, $4)", [o.account_id, o.amount_halalas, orderId, o.ref]);
  await setOrderStatus(ctx, orderId, "executed", { executed_by: ctx.actor.personId, executed_at: ctx.now.toISOString(), proof_file_id: input.proofFileId, finance_ref: input.financeRef, receipt_due_at: receiptDue.toISOString() });
  await ctx.tx.query("update finance.installments set status = 'paid' where id = $1", [o.installment_id]);
  const last4 = (await ctx.tx.maybe<{ iban_last4: string }>("select iban_last4 from finance.bank_accounts where id = $1", [o.bank_account_id]))?.iban_last4 ?? "—";
  await ctx.tx.emit({ type: "disbursement.executed", entityKind: "disbursement", entityId: orderId, payload: { ref: o.ref, amount: `${new Intl.NumberFormat("en-US").format(o.amount_halalas / 100)} ريال`, last4, days: cfg.settings.sla.receiptDays, org_id: o.association_id, project_id: o.project_id } });
}

/** R-065: finance returns with a reason to whoever owns the fix; the chain does NOT restart. */
export async function returnOrder(ctx: Ctx, orderId: string, reason: string) {
  authorize(ctx, "disbursement.return", {});
  if (!reason.trim()) throw new DomainError("reason_required", "سبب الإرجاع إلزامي");
  const o = await getOrder(ctx, orderId);
  if (o.status !== "ready") throw new DomainError("not_ready");
  const owner = /حساب|آيبان|بنك/.test(reason) ? "association" : "specialist";
  await setOrderStatus(ctx, orderId, "returned", { returned_reason: reason, returned_to: owner });
  await ctx.tx.emit({ type: "disbursement.returned", entityKind: "disbursement", entityId: orderId, payload: { ref: o.ref, reason, owner, org_id: o.association_id } });
}

/** The fix is recorded and the order returns to finance directly (ready), not to the start of the chain. */
export async function resolveReturn(ctx: Ctx, orderId: string, note: string) {
  const o = await getOrder(ctx, orderId);
  if (o.status !== "returned") throw new DomainError("not_returned");
  if (!(ctx.actor.grants.some((g) => ["grants_specialist", "grants_manager", "finance"].includes(g.role)) || ctx.system)) throw new DomainError("forbidden");
  const { blockers, bankAccountId } = await computeBlockers(ctx, o.association_id, o.project_id);
  if (blockers.length) throw new DomainError("blocked", blockers.map((b) => b.label).join("، "));
  await setOrderStatus(ctx, orderId, "ready", { returned_reason: null, returned_to: null, bank_account_id: bankAccountId });
  await ctx.tx.emit({ type: "disbursement.ready", entityKind: "disbursement", entityId: orderId, payload: { ref: o.ref, resolved: note, org_id: o.association_id } });
}

export async function uploadReceipt(ctx: Ctx, orderId: string, fileId: string) {
  await ctx.tx.query("select finance.upload_receipt($1, $2)", [orderId, fileId]);
  const o = await getOrder(ctx, orderId);
  await ctx.tx.emit({ type: "receipt.received", entityKind: "disbursement", entityId: orderId, payload: { org_id: o.association_id } });
}

/** R-068: the export matches the records exactly — same rows, same amounts. */
export async function exportOrdersCsv(ctx: Ctx, filter: { status?: string } = {}) {
  authorize(ctx, "disbursement.execute", {});
  const rows = await ctx.tx.query<{ ref: string; project_ref: string; association: string; amount_halalas: number; status: string; executed_at: string | null; finance_ref: string | null; iban_last4: string | null }>(
    `select o.ref, p.ref as project_ref, a.name as association, o.amount_halalas, o.status, to_char(o.executed_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') as executed_at, o.finance_ref, b.iban_last4
       from finance.disbursement_orders o join project.projects p on p.tenant_id = o.tenant_id and p.id = o.project_id
       join org.associations a on a.tenant_id = o.tenant_id and a.id = o.association_id
       left join finance.bank_accounts b on b.tenant_id = o.tenant_id and b.id = o.bank_account_id
      where ($1::text is null or o.status = $1) order by o.ref`, [filter.status ?? null]);
  const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const header = ["رقم الأمر", "المشروع", "الجمعية", "المبلغ (ريال)", "الحالة", "تاريخ التنفيذ", "مرجع النظام المالي", "آخر 4 من الآيبان"];
  const lines = rows.map((r) => [r.ref, r.project_ref, r.association, (r.amount_halalas / 100).toFixed(2), finance.ORDER_STATUS_LABEL[r.status] ?? r.status, r.executed_at, r.finance_ref, r.iban_last4].map(esc).join(","));
  return { csv: "﻿" + [header.join(","), ...lines].join("\n"), count: rows.length, totalHalalas: rows.reduce((s, r) => s + r.amount_halalas, 0) };
}
