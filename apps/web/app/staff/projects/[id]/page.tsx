import { notFound } from "next/navigation";
import { Card, CardTitle, TextArea, TextField, formatMoney } from "@wbl/ui";
import { ProjectView } from "@wbl/ui/views";
import { queries, ai, projectService } from "@wbl/services";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { asUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { aiState } from "@/lib/vm/ai";
import { DEL_LABEL, INST_LABEL, PROJECT_LABEL, delTone, fmtDate, instTone, projectTone } from "@/lib/vm/status";
import { amendmentAction, closeAction } from "./actions";

export const dynamic = "force-dynamic";

/* P1 · R-097: the project on the single entity template. */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await asUser(async (ctx) => {
    const p = await ctx.tx.maybe<{ id: string; ref: string; status: string; approved_halalas: number; application_id: string; association_id: string; current_agreement_id: string; suspended_reason: string | null; suspended_days: number }>(
      "select id, ref, status, approved_halalas, application_id, association_id, current_agreement_id, suspended_reason, suspended_days from project.projects where id = $1", [id]);
    if (!p) return null;
    const app = await ctx.tx.one<{ title: string; ref: string }>("select title, ref from cycle.applications where id = $1", [p.application_id]);
    const assoc = await ctx.tx.one<{ name: string }>("select name from org.associations where id = $1", [p.association_id]);
    const inst = await ctx.tx.query<{ id: string; label: string; amount_halalas: number; status: string }>("select id, label, amount_halalas, status from finance.installments where project_id = $1 order by seq", [id]);
    const dels = await ctx.tx.query<{ id: string; label: string; due_date: string; status: string }>("select id, label, to_char(due_date,'YYYY-MM-DD') as due_date, status from project.deliverables where project_id = $1 order by seq", [id]);
    const agreements = await ctx.tx.query<{ id: string; ref: string; version_no: number; generated_file_id: string | null; signed_file_id: string | null }>("select id, ref, version_no, generated_file_id, signed_file_id from project.agreements where application_id = $1 order by version_no", [p.application_id]);
    const fr = await ctx.tx.maybe<{ status: string }>("select status from project.final_reports where project_id = $1", [id]);
    const activity = await queries.activity(ctx, "project", id);
    const donor = await ctx.tx.one<{ ai_enabled: boolean }>("select ai_enabled from platform.donors where id = app.tenant()");
    const brief = await ai.runSyncTask(ctx, { task: "entity.brief", subjectKind: "project", subjectId: id, inputs: { now: `${PROJECT_LABEL[p.status]} · ${inst.filter((i) => i.status === "paid").length} من ${inst.length} دفعات صُرفت`, waiting: dels.find((x) => x.status === "pending") ? `التسليم التالي «${dels.find((x) => x.status === "pending")!.label}» في ${dels.find((x) => x.status === "pending")!.due_date}` : "لا تسليمات معلقة" } });
    const closable = p.status === "closing" ? { blockers: (await projectService.closureBlockers(ctx, id)).blockers } : null;
    return { p, app, assoc, inst, dels, agreements, fr, activity, donor, brief, closable };
  });
  if (!d) notFound();
  const { p } = d;
  return (
    <div className="flex flex-col gap-6">
    <ProjectView title={d.app.title} reference={p.ref} status={{ tone: projectTone[p.status] ?? "neutral", label: PROJECT_LABEL[p.status] ?? p.status }}
      brief={aiState(d.brief.id ? { id: d.brief.id, status: d.brief.status, output: d.brief.output as Record<string, unknown> | null, error: null } : null, d.donor.ai_enabled, (o) => ({ now: String(o.now), waiting: String(o.waiting), risk: o.risk ? String(o.risk) : undefined }))}
      facts={[{ label: t("nav.associations"), value: d.assoc.name }, { label: t("staff.amount"), value: <span className="font-mono">{formatMoney(p.approved_halalas)}</span> }, { label: "#", value: <span className="font-mono">{d.app.ref}</span> }, ...(p.suspended_reason ? [{ label: "التعليق", value: p.suspended_reason }] : [])]}
      installments={d.inst.map((i) => ({ id: i.id, label: i.label, amountHalalas: i.amount_halalas, state: INST_LABEL[i.status] ?? i.status, tone: instTone[i.status] ?? "neutral" }))}
      deliverables={d.dels.map((x) => ({ id: x.id, label: x.label, dueLabel: fmtDate(x.due_date), state: DEL_LABEL[x.status] ?? x.status, tone: delTone[x.status] ?? "neutral", href: `/staff/deliverables/${x.id}` }))}
      attachments={d.agreements.flatMap((a) => [a.generated_file_id && { id: a.generated_file_id, name: `${a.ref} (${a.version_no === 1 ? "الأصل" : `ملحق ${a.version_no - 1}`})`, href: `/api/files/${a.generated_file_id}` }, a.signed_file_id && { id: a.signed_file_id, name: `${a.ref} موقعة`, href: `/api/files/${a.signed_file_id}` }].filter(Boolean) as Array<{ id: string; name: string; href: string }>)}
      activity={d.activity.map((a) => ({ id: String(a.id), at: a.at, atLabel: fmtDate(a.at), actor: a.actor_label ?? "", text: a.text_key, ai: a.ai }))}
      actions={<>
        {d.fr && <a href={`/staff/projects/${id}/final-report`} className="inline-flex min-h-11 items-center rounded-md border border-deep-green px-4 font-bold">{t("staff.finalReport")}</a>}
        <a href={`/staff/agreements/${p.current_agreement_id}`} className="inline-flex min-h-11 items-center rounded-md border border-deep-green px-4 font-bold">{t("staff.agreement")}</a>
      </>}
    />
    {(p.status === "active" || p.status === "suspended") && (
      <Card className="mx-auto w-full max-w-[1280px]">
        <CardTitle>{t("staff.requestAmendment")}</CardTitle>
        <ActionForm action={amendmentAction.bind(null, id)}>
          <TextArea label={t("staff.justification")} name="justification" required />
          <TextField label={t("staff.newAmount")} name="amount" type="number" dir="ltr" />
          <SubmitButton variant="secondary">{t("staff.requestAmendment")}</SubmitButton>
        </ActionForm>
      </Card>
    )}
    {d.closable && d.closable.blockers.length > 0 && <p className="mx-auto w-full max-w-[1280px] text-body-sm text-warning-text">{t("staff.closeBlocked")}: {d.closable.blockers.join("، ")}</p>}
    <form action={async () => { "use server"; await closeAction(id); }} className="mx-auto w-full max-w-[1280px]">{p.status === "closing" && <SubmitButton variant="secondary">{t("staff.closeProject")}</SubmitButton>}</form>
    </div>
  );
}
