import { notFound } from "next/navigation";
import { Card, CardTitle, RefNumber, PageHeader, StatusBadge, TextArea, formatMoney } from "@wbl/ui";
import { EntityRef } from "@wbl/ui/entity";
import { finance } from "@wbl/domain";
import { approvalService, financeService } from "@wbl/services";
import { resolveRef } from "@wbl/kernel";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { asUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { orderTone } from "@/lib/vm/status";
import { OrderClient } from "./OrderClient";
import { approveOrderAction, recheckAction, resolveAction } from "./actions";

export const dynamic = "force-dynamic";

/* F2 · R-063 R-065: the order, its blockers, execute with proof or return with a reason. Payment data only (R-081). */
export default async function Order({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await asUser(async (ctx) => {
    const o = await financeService.getOrder(ctx, id).catch(() => null);
    if (!o) return null;
    const ctxRow = await ctx.tx.one<{ project_ref: string; association_name: string }>("select project_ref, association_name from finance.payment_context where project_id = $1", [o.project_id]);
    const inst = await ctx.tx.one<{ label: string }>("select label from finance.installments where id = $1", [o.installment_id]);
    const bank = o.bank_account_id ? await ctx.tx.maybe<{ bank_name: string; iban_last4: string; status: string }>("select bank_name, iban_last4, status from finance.bank_accounts where id = $1", [o.bank_account_id]) : null;
    const { blockers } = await financeService.computeBlockers(ctx, o.association_id, o.project_id);
    const ap = await approvalService.openInstanceFor(ctx, "disbursement", id);
    const awaiting = ap ? await approvalService.awaitsActor(ctx, ap) : false;
    const isFinance = ctx.actor.grants.some((g) => g.role === "finance");
    return { o, ctxRow, inst, bank, blockers, ap, awaiting, isFinance,
      association: resolveRef(ctx.actor, { kind: "association", id: o.association_id, label: ctxRow.association_name, orgId: o.association_id }),
      project: resolveRef(ctx.actor, { kind: "project", id: o.project_id, label: ctxRow.project_ref, orgId: o.association_id }) };
  });
  if (!d) notFound();
  return (
    <div className="flex flex-col gap-4">
      {/* Once ready, the order view carries its own heading; before that this page states what is being approved. */}
      {d.o.status !== "ready" && d.o.status !== "executed"
        ? <PageHeader title={t("order.title")} eyebrow={<RefNumber>{d.o.ref}</RefNumber>} actions={<StatusBadge tone={orderTone[d.o.status] ?? "neutral"}>{finance.ORDER_STATUS_LABEL[d.o.status]}</StatusBadge>} />
        : <div><StatusBadge tone={orderTone[d.o.status] ?? "neutral"}>{finance.ORDER_STATUS_LABEL[d.o.status]}</StatusBadge></div>}
      {d.o.returned_reason && <p className="text-body-sm text-danger-text">{d.o.returned_reason}</p>}
      {/* What the approver is approving: always visible, whatever the state (R-081: payment data only). */}
      {d.o.status !== "ready" && d.o.status !== "executed" && <Card>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-body-sm sm:grid-cols-2">
          <div><dt className="text-text-muted">{t("order.association")}</dt><dd><EntityRef entity={d.association} /></dd></div>
          <div><dt className="text-text-muted">{t("order.project")}</dt><dd><EntityRef entity={d.project} /></dd></div>
          <div><dt className="text-text-muted">{t("order.installment")}</dt><dd>{d.inst.label}</dd></div>
          <div><dt className="text-text-muted">{t("order.amount")}</dt><dd className="font-mono">{formatMoney(d.o.amount_halalas)}</dd></div>
          <div><dt className="text-text-muted">{t("order.account")}</dt><dd>{d.bank ? <>{d.bank.bank_name} <span dir="ltr" className="font-mono">•••• {d.bank.iban_last4}</span></> : "—"}</dd></div>
          {d.ap && <div><dt className="text-text-muted">{t("order.chain")}</dt><dd><ol className="flex flex-wrap gap-2">{d.ap.chain.applicable.map((l, i) => (
            <li key={l.key}><StatusBadge tone={i < d.ap!.chain.current ? "done" : i === d.ap!.chain.current ? "active" : "neutral"}>{l.label}</StatusBadge></li>))}</ol></dd></div>}
          {d.blockers.length > 0 && <div className="sm:col-span-2"><dt className="text-text-muted">{t("order.blockers")}</dt><dd className="text-danger-text">{d.blockers.map((b) => b.label).join("، ")}</dd></div>}
        </dl>
      </Card>}
      {d.awaiting && d.ap && <Card><CardTitle>{t("staff.awaitingYou")}</CardTitle><form action={async () => { "use server"; await approveOrderAction(id, d.ap!.id); }}><SubmitButton>{t("staff.approve")}</SubmitButton></form></Card>}
      {d.o.status === "blocked" && <form action={async () => { "use server"; await recheckAction(id); }}><SubmitButton variant="secondary">{t("staff.recheck")}</SubmitButton></form>}
      {d.o.status === "returned" && !d.isFinance && (
        <Card><ActionForm action={resolveAction.bind(null, id)}><TextArea label={t("staff.fixNote")} name="note" required /><SubmitButton>{t("staff.resolveReturn")}</SubmitButton></ActionForm></Card>
      )}
      {(d.o.status === "ready" || d.o.status === "executed") && (
        <OrderClient id={id} outcome={d.o.status === "executed" ? "executed" : null} canAct={d.isFinance}
          order={{ ref: d.o.ref, association: d.association, project: d.project, amountHalalas: d.o.amount_halalas, installment: d.inst.label,
            account: { bank: d.bank?.bank_name ?? "—", ibanMasked: d.bank ? `SA•• •••• •••• •••• ${d.bank.iban_last4}` : "—", acknowledged: d.bank?.status === "acknowledged" },
            blockers: d.blockers.map((b) => b.label) }} />
      )}
    </div>
  );
}
