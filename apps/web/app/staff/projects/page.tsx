import { PageHeader, StatusBadge, Table, formatMoney } from "@wbl/ui";
import { asUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { PROJECT_LABEL, projectTone } from "@/lib/vm/status";

export const dynamic = "force-dynamic";

export default async function Projects() {
  const rows = await asUser((ctx) => ctx.tx.query<{ id: string; ref: string; title: string; association: string; approved_halalas: number; status: string }>(
    `select p.id, p.ref, a.title, o.name as association, p.approved_halalas, p.status from project.projects p
       join cycle.applications a on a.tenant_id = p.tenant_id and a.id = p.application_id join org.associations o on o.tenant_id = p.tenant_id and o.id = p.association_id order by p.created_at desc`), { readOnly: true }).catch(() => []);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("nav.projects")} />
      <Table caption={t("nav.projects")} rows={rows} rowKey={(r) => r.id} columns={[
        { key: "r", header: "#", mono: true, cell: (r) => <a className="text-link hover:underline" href={`/staff/projects/${r.id}`}>{r.ref}</a> },
        { key: "t", header: t("col.title"), cell: (r) => r.title },
        { key: "a", header: t("col.association"), cell: (r) => r.association },
        { key: "m", header: t("staff.amount"), mono: true, cell: (r) => formatMoney(r.approved_halalas, false) },
        { key: "s", header: t("col.state"), cell: (r) => <StatusBadge tone={projectTone[r.status] ?? "neutral"}>{PROJECT_LABEL[r.status] ?? r.status}</StatusBadge> },
      ]} />
    </div>
  );
}
