import { revalidatePath } from "next/cache";
import { Card, CardTitle, PageHeader, SelectField, Table, TextField } from "@wbl/ui";
import { iam } from "@wbl/domain";
import { orgService } from "@wbl/services";
import { StepUpForm } from "./StepUpForm";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";
import { t } from "@/lib/i18n";
import { orgOf } from "@/lib/vm/portal";

export const dynamic = "force-dynamic";

/* R-012 R-092: the owner adds users after a step-up code; R-070: bank account changes. */
export default async function Account() {
  const d = await asUser(async (ctx) => {
    const org = orgOf(ctx);
    const users = await ctx.tx.query<{ id: string; full_name: string; role: string }>("select m.id, p.full_name, m.role from iam.memberships m join iam.persons p on p.id = m.person_id where m.org_id = $1 and m.active", [org]);
    const banks = await ctx.tx.query<{ id: string; bank_name: string; iban_last4: string; status: string }>("select id, bank_name, iban_last4, status from finance.bank_accounts where association_id = $1 and status <> 'replaced' order by created_at desc", [org]);
    return { users, banks, owner: ctx.actor.grants.some((g) => g.role === "assoc_owner") };
  }, { readOnly: true });
  async function sendCode(purpose: "delegation" | "bank_account") {
    "use server";
    return run(() => asUser(async (ctx) => (await orgService.startStepUp(ctx, purpose, orgOf(ctx))).otpId));
  }
  async function addUser(_: unknown, fd: FormData) {
    "use server";
    const r = await run(() => asUser(async (ctx) => {
      const org = orgOf(ctx);
      const v = await orgService.verifyOtp(ctx, String(fd.get("otpId")), "delegation", String(fd.get("code")));
      if (!v.ok) throw new Error("otp");
      return orgService.addAssociationUser(ctx, { associationId: org, otpId: String(fd.get("otpId")), fullName: String(fd.get("name")), email: String(fd.get("email")), phone: String(fd.get("phone")), role: String(fd.get("role")) as "assoc_applicant", password: String(fd.get("password")) });
    }), t("app.saved"));
    revalidatePath("/portal/account");
    return r;
  }
  async function changeBank(_: unknown, fd: FormData) {
    "use server";
    const r = await run(() => asUser(async (ctx) => {
      const v = await orgService.verifyOtp(ctx, String(fd.get("otpId")), "bank_account", String(fd.get("code")));
      if (!v.ok) throw new Error("otp");
      return orgService.requestBankChange(ctx, { associationId: orgOf(ctx), otpId: String(fd.get("otpId")), bankName: String(fd.get("bank")), iban: String(fd.get("iban")) });
    }), t("portal.bankPending"));
    revalidatePath("/portal/account");
    return r;
  }
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 pb-24 md:pb-6">
      <PageHeader title={t("nav.account")} />
      <Card>
        <CardTitle>{t("portal.users")}</CardTitle>
        <Table caption={t("portal.users")} rows={d.users} rowKey={(u) => u.id} columns={[{ key: "n", header: t("auth.fullName"), cell: (u) => u.full_name }, { key: "r", header: t("settings.role"), cell: (u) => iam.ROLE_LABEL[u.role as iam.Role] }]} />
        {d.owner && <StepUpForm label={t("portal.addUser")} sendCode={sendCode.bind(null, "delegation")} action={addUser}>
          <TextField label={t("auth.fullName")} name="name" required />
          <TextField label={t("auth.email")} name="email" type="email" dir="ltr" required />
          <TextField label={t("auth.phone")} name="phone" dir="ltr" required />
          <TextField label={t("auth.password")} name="password" type="password" dir="ltr" required />
          <SelectField label={t("settings.role")} name="role" options={[{ value: "assoc_applicant", label: iam.ROLE_LABEL.assoc_applicant }, { value: "assoc_coordinator", label: iam.ROLE_LABEL.assoc_coordinator }]} />
        </StepUpForm>}
      </Card>
      <Card>
        <CardTitle>{t("portal.bank")}</CardTitle>
        <ul className="mb-3 flex flex-col gap-1 text-body-sm">{d.banks.map((b) => <li key={b.id}>{b.bank_name} · <span className="font-mono" dir="ltr">•••• {b.iban_last4}</span> · {b.status === "pending" ? t("portal.bankPending") : "✓"}</li>)}</ul>
        {d.owner && <StepUpForm label={t("portal.changeBank")} sendCode={sendCode.bind(null, "bank_account")} action={changeBank}>
          <TextField label={t("portal.bankName")} name="bank" required />
          <TextField label={t("portal.iban")} name="iban" dir="ltr" required />
        </StepUpForm>}
      </Card>
    </div>
  );
}
