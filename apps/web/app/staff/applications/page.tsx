import { queries } from "@wbl/services";
import { PageHeader } from "@wbl/ui";
import { AppTable } from "@wbl/ui/views";
import { asUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { appTone, dueLabel, statusLabel } from "@/lib/vm/status";

export const dynamic = "force-dynamic";

export default async function Applications({ searchParams }: { searchParams: Promise<{ status?: string; late?: string; mine?: string; q?: string }> }) {
  const sp = await searchParams;
  const rows = await asUser((ctx) => queries.listApplications(ctx, { status: sp.status, late: sp.late === "1", mine: sp.mine === "1", q: sp.q }), { readOnly: true });
  const filters = [{ href: "/staff/applications", label: t("staff.filterAll") }, { href: "?mine=1", label: t("staff.mine") }, { href: "?late=1", label: t("staff.late") }];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("staff.applicationsTitle")} actions={<form className="flex gap-2"><input name="q" defaultValue={sp.q} aria-label={t("app.search")} placeholder={t("app.search")} className="rounded-md border border-border px-3 py-2" /></form>} />
      <nav className="flex gap-3 text-body-sm">{filters.map((f) => <a key={f.href} href={f.href} className="text-link underline-offset-4 hover:underline">{f.label}</a>)}</nav>
      <AppTable caption={t("staff.applicationsTitle")} rows={rows.map((r) => ({
        id: r.id, ref: r.ref, title: r.title, association: r.association, program: r.program, stage: statusLabel(r.status), stageTone: appTone[r.status] ?? "neutral",
        requestedHalalas: r.requested_halalas, dueAt: r.due_at ? dueLabel(r.due_at) : undefined, dueTone: r.tone === "neutral" ? "neutral" : (r.tone as "active"), href: `/staff/applications/${r.id}`,
      }))} />
    </div>
  );
}
