import { t } from "@/lib/i18n";
import { queries } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { appTone, statusLabel } from "@/lib/vm/status";
import { ReassignClient } from "./ReassignClient";

export const dynamic = "force-dynamic";

/* M2 · R-027: single, bulk or whole-custody reassignment with a mandatory reason. */
export default async function Reassign() {
  const d = await asUser(async (ctx) => {
    const apps = (await queries.listApplications(ctx)).filter((a) => ["submitted", "in_review", "awaiting_info"].includes(a.status));
    const staff = await ctx.tx.query<{ id: string; full_name: string }>("select m.id, p.full_name from iam.memberships m join iam.persons p on p.id = m.person_id where m.role = 'grants_specialist' and m.active order by p.full_name");
    return { apps, staff };
  }, { readOnly: true });
  return <ReassignClient applications={d.apps.map((a) => ({ id: a.id, ref: a.ref, title: `${a.title} — ${a.assignee ?? ""}`, association: a.association, program: a.program, stage: statusLabel(a.status), stageTone: appTone[a.status] ?? "neutral", requestedHalalas: a.requested_halalas, href: null }))}
    recipients={[{ value: "", label: t("staff.byLoad") }, ...d.staff.map((s) => ({ value: s.id, label: s.full_name }))]} />;
}
