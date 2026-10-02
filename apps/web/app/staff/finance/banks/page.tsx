import { EmptyState, PageHeader, Table } from "@wbl/ui";
import { orgService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { SubmitButton } from "@/components/ActionForm";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

/* R-070: finance acknowledges new bank accounts; no payment reaches an unacknowledged one. */
export default async function Banks() {
  const rows = await asUser((ctx) => ctx.tx.query<{ id: string; bank_name: string; iban_last4: string; association: string; created_at: string }>(
    "select b.id, b.bank_name, b.iban_last4, a.name as association, b.created_at from finance.bank_accounts b join org.associations a on a.tenant_id = b.tenant_id and a.id = b.association_id where b.status = 'pending' order by b.created_at"), { readOnly: true });
  async function ack(id: string) { "use server"; await asUser((ctx) => orgService.acknowledgeBank(ctx, id)); revalidatePath("/staff/finance/banks"); }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("staff.banksTitle")} />
      {rows.length === 0 ? <EmptyState title={t("staff.noBanks")} /> : (
        <Table caption={t("staff.banksTitle")} rows={rows} rowKey={(r) => r.id} columns={[
          { key: "a", header: t("nav.associations"), cell: (r) => r.association },
          { key: "b", header: t("portal.bankName"), cell: (r) => r.bank_name },
          { key: "i", header: t("portal.iban"), mono: true, cell: (r) => `•••• ${r.iban_last4}` },
          { key: "x", header: "", cell: (r) => <form action={ack.bind(null, r.id)}><SubmitButton variant="secondary">{t("staff.acknowledge")}</SubmitButton></form> },
        ]} />
      )}
    </div>
  );
}
