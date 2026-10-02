import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { EmptyState, PageHeader, StatusBadge, Table, TextField } from "@wbl/ui";
import { PortalShell } from "@wbl/ui/views";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { asUser, currentActor } from "@/lib/auth";
import { run } from "@/lib/actions";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/* R-060: the supplier sees its own orders only and confirms delivery with proof; R-061 matching happens on the association side. */
export default async function Supplier() {
  const me = await currentActor();
  if (!me) redirect("/login");
  if (!me.actor.grants.some((g) => g.role === "supplier_rep")) redirect("/home");
  const rows = await asUser((ctx) => ctx.tx.query<{ id: string; ref: string; item: string; quantity: number; status: string }>("select id, ref, item, quantity, status from finance.supplier_orders order by created_at desc"), { readOnly: true });
  async function confirm(id: string, _: unknown, fd: FormData) {
    "use server";
    const r = await run(() => asUser((ctx) => ctx.tx.query("update finance.supplier_orders set supplier_confirmed_qty = $2, status = case when association_confirmed_qty = $2 then 'delivered' else 'supplier_confirmed' end, version = version + 1 where id = $1", [id, Number(fd.get("qty"))])), t("app.saved"));
    revalidatePath("/supplier");
    return r;
  }
  return (
    <PortalShell donorName={me.donor.name} nav={[{ href: "/supplier", label: t("nav.orders"), icon: "suppliers", active: true }]} user={<form action="/logout" method="post"><button className="text-link underline">{t("app.logout")}</button></form>}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 pb-24">
        <PageHeader title={t("nav.orders")} />
        {rows.length === 0 ? <EmptyState title={t("nav.orders")} /> : <Table caption={t("nav.orders")} rows={rows} rowKey={(r) => r.id} columns={[
          { key: "r", header: "#", mono: true, cell: (r) => r.ref },
          { key: "i", header: "", cell: (r) => `${r.item} × ${r.quantity}` },
          { key: "s", header: "", cell: (r) => <StatusBadge tone={r.status === "delivered" ? "done" : "active"}>{r.status}</StatusBadge> },
          { key: "c", header: "", cell: (r) => r.status === "issued" ? <ActionForm action={confirm.bind(null, r.id)} className="flex items-end gap-2"><TextField label="#" name="qty" type="number" dir="ltr" defaultValue={String(r.quantity)} /><SubmitButton variant="secondary">✓</SubmitButton></ActionForm> : "—" },
        ]} />}
      </div>
    </PortalShell>
  );
}
