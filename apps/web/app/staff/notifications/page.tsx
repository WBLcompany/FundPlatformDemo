import { EmptyState, PageHeader } from "@wbl/ui";
import { asUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { fmtDate } from "@/lib/vm/status";

export const dynamic = "force-dynamic";

/* R-102: in-app notifications for the signed-in person. */
export default async function Notifications() {
  const rows = await asUser(async (ctx) => {
    const r = await ctx.tx.query<{ id: string; params: { subject: string; body: string }; created_at: string; status: string }>("select id, params, created_at, status from kernel.notifications where recipient_person = auth.uid() and channel = 'in_app' order by created_at desc limit 100");
    await ctx.tx.query("update kernel.notifications set status = 'read', read_at = now() where recipient_person = auth.uid() and channel = 'in_app' and status = 'sent'");
    return r;
  });
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={t("app.notifications")} />
      {rows.length === 0 ? <EmptyState title={t("app.noNotifications")} /> : (
        <ul className="flex flex-col gap-2">{rows.map((n) => <li key={n.id} className="rounded-md border border-border bg-surface p-4"><p className={`text-body ${n.status === "sent" ? "font-bold" : ""}`}>{n.params.subject}</p><p className="whitespace-pre-line text-body-sm text-text-muted">{n.params.body}</p><p className="font-mono text-caption text-text-muted">{fmtDate(n.created_at)}</p></li>)}</ul>
      )}
    </div>
  );
}
