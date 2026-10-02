import { Card, CardTitle, PageHeader, Stat, Table, formatMoney, formatNumber } from "@wbl/ui";
import { framework } from "@wbl/domain";
import { asUser } from "@/lib/auth";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/* R-104 R-105 R-106 R-107: disbursement, waqf alignment, outputs, and the indicator board — totals match the ledgers. */
export default async function Reports({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const sp = await searchParams;
  const d = await asUser(async (ctx) => {
    const program = sp.program ?? null;
    const disb = await ctx.tx.query<{ month: string; n: number; total: number }>(
      "select to_char(month, 'YYYY-MM') as month, count(*)::int as n, sum(amount_halalas)::bigint as total from reporting.disbursements where status = 'executed' and ($1::text is null or program_id = $1) group by month order by month", [program]);
    const ledger = await ctx.tx.maybe<{ s: number }>("select coalesce(sum(disbursed_halalas),0)::bigint as s from finance.balances");
    const waqf = await ctx.tx.query<{ waqf_category: string; grants: number; approved_halalas: number }>("select waqf_category, grants::int, approved_halalas::bigint from reporting.waqf_alignment order by approved_halalas desc");
    const outputs = await ctx.tx.query<{ program_id: string; reports: number; beneficiaries: number; female_beneficiaries: number; spent_halalas: number }>("select program_id, reports::int, beneficiaries::int, female_beneficiaries::int, spent_halalas::bigint from reporting.outputs");
    const pipeline = await ctx.tx.query<{ status: string; applications: number; requested_halalas: number }>("select status, sum(applications)::int as applications, sum(requested_halalas)::bigint as requested_halalas from reporting.pipeline where ($1::text is null or program_id = $1) group by status", [program]);
    const cfg = await ctx.tx.maybe<{ snapshot: framework.FrameworkConfig }>("select snapshot from framework.current_version");
    return { disb, ledger: ledger?.s ?? 0, waqf, outputs, pipeline, cfg: cfg?.snapshot };
  }, { readOnly: true });
  const totalDisb = d.disb.reduce((s, r) => s + Number(r.total), 0);
  const approvedSum = d.waqf.reduce((s, r) => s + Number(r.approved_halalas), 0);
  const label = (k: string) => d.cfg?.waqfCategories.find((c) => c.key === k)?.label ?? k;
  const target = (k: string) => d.cfg?.waqfCategories.find((c) => c.key === k)?.targetPercent;
  const prog = (k: string) => d.cfg?.programs.find((p) => p.id === k)?.name ?? k;
  const count = (s: string) => d.pipeline.find((p) => p.status === s)?.applications ?? 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("reports.title")} actions={<form className="flex items-center gap-2"><label htmlFor="program" className="text-caption">{t("reports.program")}</label><select id="program" name="program" defaultValue={sp.program ?? ""} className="rounded-md border border-border px-2 py-1"><option value="">{t("reports.allPrograms")}</option>{d.cfg?.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="text-link underline">↵</button></form>} />
      <section aria-labelledby="kpi"><h2 id="kpi" className="mb-3 text-h2 font-bold">{t("reports.dashboard")}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t("reports.submitted")} value={formatNumber(d.pipeline.reduce((s, p) => s + p.applications, 0))} href="/staff/applications" />
          <Stat label={t("reports.approvedCount")} value={formatNumber(count("approved") + count("agreement") + count("project"))} href="/staff/applications?status=approved" />
          <Stat label={t("reports.approvedSum")} value={formatMoney(approvedSum, false)} />
          <Stat label={t("reports.disbursedSum")} value={formatMoney(totalDisb, false)} />
        </div>
      </section>
      <Card>
        <CardTitle action={<a className="text-link underline text-body-sm" href="/api/export/orders">{t("staff.export")}</a>}>{t("reports.disbursements")}</CardTitle>
        <Table caption={t("reports.disbursements")} rows={d.disb} rowKey={(r) => r.month} columns={[
          { key: "m", header: t("reports.month"), mono: true, cell: (r) => r.month },
          { key: "n", header: t("reports.count"), mono: true, cell: (r) => r.n },
          { key: "t", header: t("reports.total"), mono: true, cell: (r) => formatMoney(Number(r.total), false) },
        ]} />
        <p className="mt-2 text-caption text-text-muted" data-testid="ledger-check">{t("reports.total")}: <span className="font-mono">{formatMoney(totalDisb, false)}</span> = {formatMoney(Number(d.ledger), false)}</p>
      </Card>
      <Card>
        <CardTitle>{t("reports.waqf")}</CardTitle>
        <Table caption={t("reports.waqf")} rows={d.waqf} rowKey={(r) => r.waqf_category} columns={[
          { key: "c", header: t("reports.category"), cell: (r) => label(r.waqf_category) },
          { key: "n", header: t("reports.count"), mono: true, cell: (r) => r.grants },
          { key: "a", header: t("reports.actual"), mono: true, cell: (r) => `${formatMoney(Number(r.approved_halalas), false)} (${approvedSum ? Math.round((Number(r.approved_halalas) / approvedSum) * 100) : 0}%)` },
          { key: "t", header: t("reports.target"), mono: true, cell: (r) => (target(r.waqf_category) != null ? `${target(r.waqf_category)}%` : "—") },
        ]} />
      </Card>
      <Card>
        <CardTitle>{t("reports.outputs")}</CardTitle>
        <Table caption={t("reports.outputs")} rows={d.outputs} rowKey={(r) => r.program_id} columns={[
          { key: "p", header: t("reports.program"), cell: (r) => prog(r.program_id) },
          { key: "r", header: t("reports.count"), mono: true, cell: (r) => r.reports },
          { key: "b", header: t("reports.beneficiaries"), mono: true, cell: (r) => r.beneficiaries },
          { key: "f", header: t("reports.female"), mono: true, cell: (r) => r.female_beneficiaries },
          { key: "s", header: t("reports.spent"), mono: true, cell: (r) => formatMoney(Number(r.spent_halalas), false) },
        ]} />
      </Card>
    </div>
  );
}
