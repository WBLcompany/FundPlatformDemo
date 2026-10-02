import { queries } from "@wbl/services";
import { FinanceHomeView } from "@wbl/ui/views";
import { resolveRef } from "@wbl/kernel";
import { finance } from "@wbl/domain";
import { asUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { orderTone } from "@/lib/vm/status";

export const dynamic = "force-dynamic";

/* F1 · R-080: awaiting execution, returned and blocked (with reasons), upcoming. */
export default async function Finance() {
  const d = await asUser(async (ctx) => {
    const h = await queries.financeHome(ctx);
    const r = (o: { id: string; ref: string; association_id: string; association_name: string; amount_halalas: number; status: string; returned_reason?: string | null; blockers?: Array<{ label: string }> }) => ({
      id: o.id, ref: o.ref, association: resolveRef(ctx.actor, { kind: "association", id: o.association_id, label: o.association_name, orgId: o.association_id }),
      amountHalalas: o.amount_halalas, state: finance.ORDER_STATUS_LABEL[o.status] ?? o.status, tone: orderTone[o.status] ?? "neutral",
      reason: o.returned_reason ?? (o.blockers?.length ? o.blockers.map((b) => b.label).join("، ") : undefined), href: `/staff/finance/orders/${o.id}`,
    });
    return {
      awaiting: h.awaiting.map(r), returned: h.returned.map(r),
      upcoming: h.upcoming.map((u) => ({ id: u.id, ref: u.project_ref, association: resolveRef(ctx.actor, { kind: "association", id: u.association_id, label: u.association_name, orgId: u.association_id }), amountHalalas: u.amount_halalas, state: u.label, tone: "neutral" as const, href: null, dueLabel: u.condition === "final_report" ? "بعد التقرير الختامي" : "بعد قبول التسليم" })),
    };
  }, { readOnly: true });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4 text-body-sm"><a className="text-link underline" href="/api/export/orders">{t("staff.export")}</a><a className="text-link underline" href="/staff/finance/banks">{t("staff.banksTitle")}</a></div>
      <FinanceHomeView {...d} />
    </div>
  );
}
