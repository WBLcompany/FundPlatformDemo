import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Card, CardTitle, PageHeader, SelectField, Table, TextField } from "@wbl/ui";
import { cycle, iam } from "@wbl/domain";
import { orgService } from "@wbl/services";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/* R-001 users, R-026 absence, R-029 resignation lock, R-091 no self-change. */
export default async function Users() {
  const rows = await asUser((ctx) => ctx.tx.query<{ id: string; person_id: string; full_name: string; email: string; role: string; active: boolean; absent_from: string | null; absent_until: string | null; open: number }>(
    `select m.id, m.person_id, p.full_name, p.email, m.role, m.active, to_char(m.absent_from,'YYYY-MM-DD') as absent_from, to_char(m.absent_until,'YYYY-MM-DD') as absent_until,
       (select count(*)::int from cycle.applications a where a.assignee_membership_id = m.id and a.status in ('submitted','in_review','awaiting_info','in_approval')) as open
       from iam.memberships m join iam.persons p on p.id = m.person_id where m.org_id is null order by p.full_name`), { readOnly: true });
  async function add(_: unknown, fd: FormData) {
    "use server";
    const r = await run(() => asUser((ctx) => ctx.tx.query("select iam.add_staff_user($1,$2,$3,$4,$5,$6,null)", [randomUUID(), fd.get("name"), String(fd.get("email")).toLowerCase(), fd.get("phone"), orgService.hashPassword(String(fd.get("password"))), fd.get("role")])), t("app.saved"));
    revalidatePath("/staff/settings/users");
    return r;
  }
  async function absence(id: string, _: unknown, fd: FormData) {
    "use server";
    const r = await run(() => asUser((ctx) => ctx.tx.query("update iam.memberships set absent_from = nullif($2,'')::date, absent_until = nullif($3,'')::date where id = $1", [id, fd.get("from"), fd.get("until")])), t("app.saved"));
    revalidatePath("/staff/settings/users");
    return r;
  }
  async function deactivate(id: string, open: number) {
    "use server";
    const check = cycle.canDeactivate(open);
    if (!check.ok) return;
    await asUser((ctx) => ctx.tx.query("update iam.memberships set active = false where id = $1", [id]));
    revalidatePath("/staff/settings/users");
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("settings.users")} />
      <Table caption={t("settings.users")} rows={rows} rowKey={(r) => r.id} columns={[
        { key: "n", header: t("auth.fullName"), cell: (r) => <a className="text-link hover:underline" href={`/staff/people/${r.person_id}`}>{r.full_name}</a> },
        { key: "r", header: t("settings.role"), cell: (r) => iam.ROLE_LABEL[r.role as iam.Role] ?? r.role },
        { key: "o", header: t("staff.open"), mono: true, cell: (r) => r.open },
        { key: "a", header: t("staff.absence"), cell: (r) => (
          <ActionForm action={absence.bind(null, r.id)} className="flex flex-wrap items-end gap-2">
            <input type="date" name="from" defaultValue={r.absent_from ?? ""} aria-label={t("staff.absentFrom")} className="rounded-sm border border-border px-2 py-1" />
            <input type="date" name="until" defaultValue={r.absent_until ?? ""} aria-label={t("staff.absentUntil")} className="rounded-sm border border-border px-2 py-1" />
            <SubmitButton variant="secondary">{t("app.saved")}</SubmitButton>
          </ActionForm>) },
        { key: "d", header: "", cell: (r) => r.active ? (r.open > 0 ? <span className="text-caption text-warning-text">{cycle.canDeactivate(r.open).reason}</span> : <form action={deactivate.bind(null, r.id, r.open)}><button className="text-caption underline">✕</button></form>) : "—" },
      ]} />
      <Card>
        <CardTitle>{t("settings.addUser")}</CardTitle>
        <ActionForm action={add}>
          <TextField label={t("auth.fullName")} name="name" required />
          <TextField label={t("auth.email")} name="email" type="email" dir="ltr" required />
          <TextField label={t("auth.phone")} name="phone" dir="ltr" required />
          <TextField label={t("auth.password")} name="password" type="password" dir="ltr" hint={t("auth.passwordHint")} required />
          <SelectField label={t("settings.role")} name="role" options={["grants_specialist", "grants_manager", "committee_secretary", "finance", "executive", "system_admin"].map((r) => ({ value: r, label: iam.ROLE_LABEL[r as iam.Role] }))} />
          <SubmitButton>{t("settings.addUser")}</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
