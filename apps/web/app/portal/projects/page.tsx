import { EmptyState, PageHeader, StatusBadge, Table, formatMoney } from "@wbl/ui";
import { asUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { PROJECT_LABEL, projectTone } from "@/lib/vm/status";

export const dynamic = "force-dynamic";

export default async function MyProjects() {
  const rows = await asUser((ctx) => ctx.tx.query<{ id: string; ref: string; title: string; approved_halalas: number; status: string }>(
    "select p.id, p.ref, a.title, p.approved_halalas, p.status from project.projects p join cycle.applications a on a.tenant_id = p.tenant_id and a.id = p.application_id order by p.created_at desc"), { readOnly: true });
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 py-6 pb-24 md:pb-6">
      <PageHeader title={t("nav.myProjects")} />
      {rows.length === 0 ? <EmptyState title={t("nav.myProjects")} /> : <Table caption={t("nav.myProjects")} rows={rows} rowKey={(r) => r.id} columns={[
        { key: "r", header: "#", mono: true, cell: (r) => <a className="text-link hover:underline" href={`/portal/projects/${r.id}`}>{r.ref}</a> },
        { key: "t", header: t("col.title"), cell: (r) => r.title },
        { key: "m", header: t("staff.amount"), mono: true, cell: (r) => formatMoney(r.approved_halalas, false) },
        { key: "s", header: t("col.state"), cell: (r) => <StatusBadge tone={projectTone[r.status] ?? "neutral"}>{PROJECT_LABEL[r.status]}</StatusBadge> },
      ]} />}
    </div>
  );
}
