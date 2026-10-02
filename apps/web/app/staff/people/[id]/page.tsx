import { notFound } from "next/navigation";
import { Alert, PageHeader, Stat } from "@wbl/ui";
import { queries } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/* R-098: a colleague sees what is assigned; KPIs only for the person, their manager, the grants manager, the executive.
   R-028: KPIs count only the time the person held each item. */
export default async function Person({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await asUser(async (ctx) => {
    const p = await ctx.tx.maybe<{ id: string; full_name: string }>("select id, full_name from iam.persons where id = $1", [id]);
    if (!p) return null;
    const m = await ctx.tx.maybe<{ manager_person_id: string | null }>("select manager_person_id from iam.memberships where person_id = $1 limit 1", [id]);
    const canKpi = await queries.viewerCan(ctx, "person.view_kpis", { targetPersonId: id, managerOfTarget: m?.manager_person_id ?? null });
    const open = await ctx.tx.one<{ n: number }>("select count(*)::int as n from cycle.applications a join iam.memberships mm on mm.tenant_id = a.tenant_id and mm.id = a.assignee_membership_id where mm.person_id = $1 and a.status in ('submitted','in_review','awaiting_info')", [id]);
    const kpi = canKpi ? await ctx.tx.one<{ held: number; avg_days: number | null }>(
      `select count(*)::int as held, avg(extract(epoch from coalesce(c.to_at, now()) - c.from_at) / 86400)::numeric(10,1) as avg_days
         from cycle.custody c join iam.memberships mm on mm.tenant_id = c.tenant_id and mm.id = c.membership_id where mm.person_id = $1`, [id]) : null;
    return { p, open: open.n, kpi };
  }, { readOnly: true });
  if (!d) notFound();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={d.p.full_name} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={t("staff.open")} value={d.open} />
        {d.kpi && <Stat label={t("reports.count")} value={d.kpi.held} />}
        {d.kpi && <Stat label={t("reports.avgDays")} value={d.kpi.avg_days ?? "—"} />}
      </div>
      {!d.kpi && <Alert tone="info">{t("staff.kpisHidden")}</Alert>}
    </div>
  );
}
