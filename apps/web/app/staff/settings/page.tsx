import { revalidatePath } from "next/cache";
import { Card, CardTitle, PageHeader, TextField, Table } from "@wbl/ui";
import { SetupChecklistView } from "@wbl/ui/views";
import { frameworkService } from "@wbl/services";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/* G1 · R-006 N-14 + AI toggle (R-112) + holidays (R-044) + support grants (R-085). */
export default async function Settings() {
  const d = await asUser(async (ctx) => {
    const steps = await frameworkService.setupChecklist(ctx);
    const donor = await ctx.tx.one<{ ai_enabled: boolean }>("select ai_enabled from platform.donors where id = app.tenant()");
    const holidays = await ctx.tx.query<{ id: string; day: string; label: string }>("select id, to_char(day,'YYYY-MM-DD') as day, label from kernel.holidays order by day");
    const grants = await ctx.tx.query<{ id: string; operator_email: string; reason: string; expires_at: string; revoked_at: string | null }>("select id, operator_email, reason, expires_at, revoked_at from platform.support_grants order by created_at desc").catch(() => []);
    return { steps, ai: donor.ai_enabled, holidays, grants };
  });
  async function toggleAi() { "use server"; await asUser((ctx) => ctx.tx.query("update platform.donors set ai_enabled = not ai_enabled where id = app.tenant()")); revalidatePath("/staff/settings"); }
  async function addHoliday(_: unknown, fd: FormData) { "use server"; const r = await run(() => asUser((ctx) => ctx.tx.query("insert into kernel.holidays (tenant_id, day, label) values (app.tenant(), $1, $2)", [fd.get("day"), fd.get("label")])), t("app.saved")); revalidatePath("/staff/settings"); return r; }
  async function grant(_: unknown, fd: FormData) { "use server"; const r = await run(() => asUser((ctx) => ctx.tx.query("insert into platform.support_grants (tenant_id, operator_email, reason, granted_by, expires_at) values (app.tenant(), $1, $2, auth.uid(), now() + make_interval(hours => $3::int))", [fd.get("email"), fd.get("reason"), Math.min(168, Number(fd.get("hours") || 4))])), t("app.saved")); revalidatePath("/staff/settings"); return r; }
  async function revoke(id: string) { "use server"; await asUser((ctx) => ctx.tx.query("update platform.support_grants set revoked_at = now() where id = $1", [id])); revalidatePath("/staff/settings"); }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("settings.title")} actions={<nav className="flex gap-3 text-body-sm"><a className="text-link underline" href="/staff/settings/framework">{t("settings.framework")}</a><a className="text-link underline" href="/staff/settings/policy">{t("settings.policy")}</a><a className="text-link underline" href="/staff/settings/users">{t("settings.users")}</a></nav>} />
      <SetupChecklistView steps={d.steps} />
      <Card>
        <CardTitle>{t("settings.ai")}</CardTitle>
        <form action={toggleAi} className="flex items-center gap-3"><span className="text-body">{d.ai ? t("settings.aiEnabled") : t("settings.aiDisabled")}</span><SubmitButton variant="secondary">{t("settings.toggleAi")}</SubmitButton></form>
      </Card>
      <Card>
        <CardTitle>{t("settings.holidays")}</CardTitle>
        <ul className="mb-3 flex flex-col gap-1 text-body-sm">{d.holidays.map((h) => <li key={h.id}><span className="font-mono">{h.day}</span> — {h.label}</li>)}</ul>
        <ActionForm action={addHoliday} className="flex flex-wrap items-end gap-3"><TextField label={t("settings.date")} name="day" type="date" required /><TextField label={t("settings.label")} name="label" required /><SubmitButton variant="secondary">{t("settings.addHoliday")}</SubmitButton></ActionForm>
      </Card>
      <Card>
        <CardTitle>{t("settings.support")}</CardTitle>
        <Table caption={t("settings.support")} rows={d.grants} rowKey={(g) => g.id} columns={[
          { key: "e", header: t("settings.operatorEmail"), cell: (g) => g.operator_email },
          { key: "r", header: t("settings.reason"), cell: (g) => g.reason },
          { key: "x", header: "", cell: (g) => g.revoked_at ? "—" : <form action={revoke.bind(null, g.id)}><button className="text-link underline">{t("settings.revoke")}</button></form> },
        ]} />
        <ActionForm action={grant} className="mt-3 flex flex-wrap items-end gap-3"><TextField label={t("settings.operatorEmail")} name="email" type="email" dir="ltr" required /><TextField label={t("settings.reason")} name="reason" required /><TextField label={t("settings.hours")} name="hours" type="number" dir="ltr" defaultValue="4" /><SubmitButton variant="secondary">{t("settings.grantSupport")}</SubmitButton></ActionForm>
      </Card>
    </div>
  );
}
