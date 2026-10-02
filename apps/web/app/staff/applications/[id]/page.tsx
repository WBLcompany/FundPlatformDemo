import { notFound } from "next/navigation";
import { Card, CardTitle, SelectField, TextArea, TextField, StatusBadge } from "@wbl/ui";
import { ActivityTimeline } from "@wbl/ui/entity";
import { cycleService } from "@wbl/services";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { asUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { loadStudy } from "@/lib/vm/study";
import { fmtDate } from "@/lib/vm/status";
import { StudyClient } from "./StudyClient";
import { approvalAction, conflictAction, judgementAction, requestStudyAction } from "./actions";

export const dynamic = "force-dynamic";

/* S2 / S2-indep / S2-reveal / S3 — the study file, judgement and the approval step. */
export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await asUser(async (ctx) => {
    const a = await cycleService.getApplication(ctx, id).catch(() => null);
    if (!a) return null;
    // R-023: opening a submitted application starts its review for the assignee.
    if (a.status === "submitted" && ctx.actor.grants.some((g) => g.membershipId === a.assignee_membership_id)) await cycleService.startReview(ctx, id);
    return loadStudy(ctx, id);
  });
  if (!data) notFound();
  const { vm, app, inst, awaiting, agreement, project, isAssignee, sf, level, chainLabels, activity } = data;
  const canStudy = isAssignee && app.status === "in_review";
  const scheduleText = (sf?.schedule ?? []).map((s) => [s.label, s.percent, s.condition, s.deliverable, s.due_offset_days].join(" | ")).join("\n");
  return (
    <div className="flex flex-col gap-6">
      <StudyClient id={id} file={vm} canStudy={canStudy} requestInfoHref={canStudy ? `/staff/applications/${id}/request-info` : undefined} recommendHref={canStudy ? `/staff/applications/${id}/recommend` : undefined} />
      {canStudy && (
        <Card>
          <CardTitle>{t("staff.saveJudgement")}</CardTitle>
          <ActionForm action={judgementAction.bind(null, id)}>
            <TextArea label={t("staff.summary")} name="summary" defaultValue={sf?.summary ?? ""} />
            <TextArea label={t("staff.schedule")} name="schedule" hint={t("staff.scheduleHint")} defaultValue={scheduleText} className="font-mono" dir="ltr" />
            <div className="flex flex-wrap gap-2"><SubmitButton variant="secondary">{t("staff.saveJudgement")}</SubmitButton></div>
          </ActionForm>
          {vm.aiEnabled && vm.summary.status === "failed" && <form action={async () => { "use server"; await requestStudyAction(id); }} className="mt-3"><button className="text-link underline">{t("staff.draftMessage")}</button></form>}
          <form action={async () => { "use server"; await conflictAction(id); }} className="mt-3"><button className="text-caption text-text-muted underline">{t("staff.conflict")}</button></form>
        </Card>
      )}
      {inst && (
        <Card>
          <CardTitle action={<StatusBadge tone="active">{level?.label ?? "—"}</StatusBadge>}>{t("staff.chain")}</CardTitle>
          <p className="mb-3 text-body-sm">{chainLabels.join(" ← ")}</p>
          {awaiting && !level?.committee && (
            <ActionForm action={approvalAction.bind(null, id, inst.id)}>
              <p className="text-body font-bold">{t("staff.awaitingYou")}</p>
              <SelectField label={t("staff.decide")} name="kind" options={[{ value: "approve", label: t("staff.approve") }, { value: "return", label: t("staff.return") }, { value: "reject", label: t("staff.reject") }, { value: "modify_amount", label: t("staff.modifyAmount") }]} />
              <TextField label={t("staff.amount")} name="amount" type="number" dir="ltr" defaultValue={String(inst.amount_halalas / 100)} />
              <TextArea label={t("staff.note")} name="note" />
              <SubmitButton>{t("staff.decide")}</SubmitButton>
            </ActionForm>
          )}
        </Card>
      )}
      <div className="flex flex-wrap gap-4 text-body-sm">
        {app.decision && <a className="text-link underline" href={`/staff/applications/${id}/rationale`}>{t("staff.rationale")}</a>}
        {agreement && <a className="text-link underline" href={`/staff/agreements/${agreement.id}`}>{t("staff.agreement")}</a>}
        {project && <a className="text-link underline" href={`/staff/projects/${project.id}`}>{t("staff.project")}</a>}
      </div>
      <Card><ActivityTimeline items={activity.map((a) => ({ id: String(a.id), at: a.at, atLabel: fmtDate(a.at), actor: a.actor_label ?? "", text: a.text_key, ai: a.ai }))} /></Card>
    </div>
  );
}
