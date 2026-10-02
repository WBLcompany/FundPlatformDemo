import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cycle } from "@wbl/domain";
import { cycleService } from "@wbl/services";
import { Card, CardTitle, TextArea } from "@wbl/ui";
import { ApplicationTrackView, type StageVM } from "@wbl/ui/views";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";
import { t } from "@/lib/i18n";
import { appTone, fmtDate } from "@/lib/vm/status";

export const dynamic = "force-dynamic";

/* J7 · R-023: the stage shown matches the real stage; what is waiting on the association; info response (R-032). */
export default async function Track({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await asUser(async (ctx) => {
    const app = await cycleService.getApplication(ctx, id).catch(() => null);
    if (!app) return null;
    const info = await ctx.tx.maybe<{ message: string; items: string[] }>("select message, items from cycle.info_requests where application_id = $1 and status = 'open' order by sent_at desc limit 1", [id]);
    const agreement = await ctx.tx.maybe<{ id: string; status: string }>("select id, status from project.agreements where application_id = $1 and version_no = 1", [id]);
    const project = await ctx.tx.maybe<{ id: string }>("select id from project.projects where application_id = $1", [id]);
    const assoc = await ctx.tx.one<{ name: string }>("select name from org.associations where id = $1", [app.association_id]);
    return { app, info, agreement, project, assoc };
  }, { readOnly: true });
  if (!d) notFound();
  const { app } = d;
  const current = cycle.ASSOCIATION_STAGE[app.status].key;
  const idx = cycle.STAGE_ORDER.indexOf(current as (typeof cycle.STAGE_ORDER)[number]);
  const labels: Record<string, string> = Object.fromEntries(["submitted", "review", "approval", "decision", "agreement", "project"].map((k) => [k, t(`portal.stage.${k}`)]));
  const stages: StageVM[] = cycle.STAGE_ORDER.map((k, i) => ({ key: k, label: labels[k]!, state: i < idx ? "done" : i === idx ? "current" : "upcoming", atLabel: k === "submitted" ? fmtDate(app.submitted_at) : undefined }));
  async function answer(_: unknown, fd: FormData) { "use server"; const r = await run(() => asUser((ctx) => cycleService.answerInfo(ctx, id, String(fd.get("note") ?? ""))), t("portal.infoSent")); revalidatePath(`/portal/applications/${id}`); return r; }
  async function withdraw() { "use server"; await run(() => asUser((ctx) => cycleService.withdraw(ctx, id))); revalidatePath(`/portal/applications/${id}`); }
  const waiting = d.info ? d.info.message : d.agreement?.status === "issued" ? t("portal.agreementReady") : null;
  return (
    <div className="flex flex-col">
      <ApplicationTrackView application={{ id, ref: app.ref ?? "", title: app.title, association: { kind: "association", id: app.association_id, label: d.assoc.name }, program: "", stage: cycle.ASSOCIATION_STAGE[app.status].label, stageTone: appTone[app.status] ?? "neutral", requestedHalalas: app.requested_halalas ?? 0, href: null }}
        stages={stages} waiting={waiting} respondHref={d.info ? `/portal/applications/${id}/edit` : d.agreement?.status === "issued" ? `/portal/agreements/${d.agreement.id}` : null} submittedOn={app.submitted_at ?? new Date().toISOString()} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-24 md:pb-6">
        {d.info && (
          <Card><CardTitle>{t("portal.respondTitle")}</CardTitle>
            <ActionForm action={answer}><TextArea label={t("portal.respondNote")} name="note" required /><SubmitButton>{t("portal.respond")}</SubmitButton></ActionForm></Card>
        )}
        {d.project && <a className="text-link underline" href={`/portal/projects/${d.project.id}`}>{t("nav.myProjects")}</a>}
        {["submitted", "in_review", "awaiting_info"].includes(app.status) && <form action={withdraw}><SubmitButton variant="danger">{t("portal.withdraw")}</SubmitButton></form>}
      </div>
    </div>
  );
}
