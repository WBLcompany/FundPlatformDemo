import { iam } from "@wbl/domain";
import { queries } from "@wbl/services";
import { ExecutiveHomeView, ManagerHomeView } from "@wbl/ui/views";
import { resolveRef } from "@wbl/kernel";
import { asUser } from "@/lib/auth";
import { appTone, statusLabel } from "@/lib/vm/status";
import { OrderClient } from "./OrderClient";

export const dynamic = "force-dynamic";

/* M1 · R-078 (manager) and E1 · R-082 (executive): every number opens its list. */
export default async function Home() {
  const d = await asUser(async (ctx) => {
    const exec = iam.rolesOf(ctx.actor).includes("executive");
    const home = exec ? await queries.executiveHome(ctx) : { ...(await queries.managerHome(ctx)), order: ["decide", "money", "team"] as Array<"decide" | "money" | "team"> };
    const team = home.team.map((m) => ({ id: m.membership_id, person: resolveRef(ctx.actor, { kind: "person", id: m.person_id, label: m.name }), open: m.open, late: m.late, absent: m.absent }));
    const awaiting = home.awaiting.map((i) => ({ ...i, association: i.association_id ? resolveRef(ctx.actor, { kind: "association", id: i.association_id, label: i.association_name ?? "", orgId: i.association_id }) : { kind: "association" as const, id: "", label: "—" } }));
    return { exec, home, team, awaiting };
  });
  const pipelineLabels = ["submitted", "in_review", "awaiting_info", "in_approval", "approved", "rejected"];
  const pipeline = pipelineLabels.map((s) => ({ key: s, label: statusLabel(s), count: d.home.pipeline.find((p) => p.status === s)?.n ?? 0, href: `/staff/applications?status=${s}` }));
  const waiting = d.awaiting.filter((i) => i.subject_kind === "application").map((i) => ({ id: i.subject_id, ref: i.ref ?? "", title: i.title ?? "", association: i.association, program: "", stage: statusLabel("in_approval"), stageTone: appTone.in_approval!, requestedHalalas: i.amount_halalas, href: `/staff/applications/${i.subject_id}` }));
  if (d.exec) {
    return <OrderClient initial={d.home.order}>{(order, setOrder) => (
      <ExecutiveHomeView order={order} onReorder={setOrder} decide={waiting}
        money={[{ label: "المعتمد", valueHalalas: d.home.money.approved, href: "/staff/applications?status=approved" }, { label: "المصروف", valueHalalas: d.home.money.disbursed, href: "/staff/reports" }, { label: "المتاح في الميزانية", valueHalalas: d.home.money.available, href: null }]}
        team={d.team} />)}</OrderClient>;
  }
  return <ManagerHomeView waiting={[...waiting, ...d.home.late.map((r) => ({ id: r.id, ref: r.ref, title: r.title, association: r.association, program: r.program, stage: statusLabel(r.status), stageTone: "late" as const, requestedHalalas: r.requested_halalas, href: `/staff/applications/${r.id}` }))]}
    pipeline={pipeline} team={d.team} reassignHref="/staff/reassign"
    period={{ approvedHalalas: d.home.money.approved, disbursedHalalas: d.home.money.disbursed, budgetLeftHalalas: d.home.money.available, approvedHref: "/staff/applications?status=approved", disbursedHref: "/staff/reports" }} />;
}
