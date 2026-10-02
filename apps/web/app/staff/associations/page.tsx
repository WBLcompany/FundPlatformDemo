import { PageHeader, StatusBadge, Table } from "@wbl/ui";
import { asUser } from "@/lib/auth";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
const L: Record<string, string> = { active: "نشطة", pending_review: "بانتظار المراجعة", suspended: "موقوفة", rejected: "مرفوضة" };

export default async function Associations() {
  const rows = await asUser((ctx) => ctx.tx.query<{ id: string; name: string; license_no: string; city: string | null; status: string }>("select id, name, license_no, city, status from org.associations order by name"), { readOnly: true });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("nav.associations")} />
      <Table caption={t("nav.associations")} rows={rows} rowKey={(r) => r.id} columns={[
        { key: "n", header: t("nav.associations"), cell: (r) => <a className="text-link hover:underline" href={`/staff/associations/${r.id}`}>{r.name}</a> },
        { key: "l", header: "#", mono: true, cell: (r) => r.license_no },
        { key: "c", header: "", cell: (r) => r.city ?? "—" },
        { key: "s", header: "", cell: (r) => <StatusBadge tone={r.status === "active" ? "done" : r.status === "pending_review" ? "near" : "late"}>{L[r.status]}</StatusBadge> },
      ]} />
    </div>
  );
}
