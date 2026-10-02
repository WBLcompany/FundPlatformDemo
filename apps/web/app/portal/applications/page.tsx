import { EmptyState, PageHeader, StatusBadge, Table, formatMoney } from "@wbl/ui";
import { asUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { portalHome } from "@/lib/vm/portal";

export const dynamic = "force-dynamic";

/* «طلباتي»: every application of the association, drafts included, newest first. */
export default async function MyApplications() {
  const d = await asUser((ctx) => portalHome(ctx), { readOnly: true });
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 py-6 pb-24 md:pb-6">
      <PageHeader title={t("nav.myApplications")} />
      {d.applications.length === 0 ? <EmptyState title={t("portal.noApplications")} /> : (
        <Table caption={t("nav.myApplications")} rows={d.applications} rowKey={(r) => r.id} columns={[
          { key: "ref", header: "#", mono: true, cell: (r) => <a className="text-link hover:underline" href={r.href ?? "#"}>{r.ref}</a> },
          { key: "title", header: t("portal.appTitle"), cell: (r) => r.title },
          { key: "program", header: t("reports.program"), cell: (r) => r.program },
          { key: "stage", header: t("portal.state"), cell: (r) => <StatusBadge tone={r.stageTone}>{r.stage}</StatusBadge> },
          { key: "amount", header: t("staff.amount"), mono: true, cell: (r) => formatMoney(r.requestedHalalas, false) },
        ]} />
      )}
    </div>
  );
}
