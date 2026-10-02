import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { PageHeader, TextField } from "@wbl/ui";
import { OperatorHealthView } from "@wbl/ui/views";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { runtime } from "@/lib/server";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/* O1 · R-083 R-084 R-085: platform health for the WBL operator, who reads NO donor data — the
   wbl_operator role can only call platform.operator_overview() (aggregates) and read incidents. */
function ok(token: string | undefined) {
  const expected = process.env.OPERATOR_TOKEN;
  if (!expected || !token) return false;
  const a = Buffer.from(token), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export default async function Operator() {
  const token = (await cookies()).get("wbl_operator")?.value;
  async function login(_: unknown, fd: FormData) {
    "use server";
    if (!ok(String(fd.get("token")))) return { ok: false, error: t("auth.invalid") };
    (await cookies()).set("wbl_operator", String(fd.get("token")), { httpOnly: true, sameSite: "strict", path: "/operator", maxAge: 3600 });
    redirect("/operator");
  }
  if (!ok(token)) {
    return <main className="mx-auto max-w-md px-4 py-12"><PageHeader title={t("operator.login")} /><ActionForm action={login}><TextField label={t("operator.token")} name="token" type="password" dir="ltr" required /><SubmitButton>{t("auth.submit")}</SubmitButton></ActionForm></main>;
  }
  const d = await runtime().db.operator(async (q) => ({
    donors: await q<{ donor_id: string; name: string; plan: string; status: string; completed_applications: number; submitted_applications: number; support_until: string | null }>("select * from platform.operator_overview()"),
    incidents: await q<{ id: string; title: string; state: string; severity: string }>("select id, title, state, severity from platform.incidents order by created_at desc limit 20"),
  }));
  return (
    <main className="mx-auto max-w-[1280px] px-4 py-8">
      <OperatorHealthView
        donors={d.donors.map((x) => ({ id: x.donor_id, name: x.name, plan: x.plan, completed: Number(x.completed_applications), status: x.status, tone: x.status === "active" ? "done" : "active", supportUntil: x.support_until ? new Date(x.support_until).toLocaleString("ar-SA-u-nu-latn") : null }))}
        incidents={d.incidents.map((i) => ({ id: i.id, title: i.title, state: i.state, tone: i.state === "resolved" ? "done" : i.severity === "critical" ? "late" : "near" }))} />
    </main>
  );
}
