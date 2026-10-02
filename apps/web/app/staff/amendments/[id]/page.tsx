import { notFound } from "next/navigation";
import { Card, CardTitle, PageHeader, StatusBadge } from "@wbl/ui";
import { ai, approvalService } from "@wbl/services";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { asUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { aiState } from "@/lib/vm/ai";
import { amendmentApprovalAction, forwardAction } from "./actions";
import { DiffClient, type AmendmentDiff } from "./DiffClient";

export const dynamic = "force-dynamic";

/* R-055–R-059: the amendment, the literal diff, Manih's impact analysis, the chain. */
export default async function Amendment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await asUser(async (ctx) => {
    const am = await ctx.tx.maybe<{ id: string; project_id: string; justification: string; changes: Record<string, unknown>; status: string; requested_side: string }>("select id, project_id, justification, changes, status, requested_side from project.amendments where id = $1", [id]);
    if (!am) return null;
    const out = await ai.latestOutput(ctx, id, "amendment.diff");
    const donor = await ctx.tx.one<{ ai_enabled: boolean }>("select ai_enabled from platform.donors where id = app.tenant()");
    const inst = await approvalService.openInstanceFor(ctx, "amendment", id);
    const awaiting = inst ? await approvalService.awaitsActor(ctx, inst) : false;
    return { am, out, aiOn: donor.ai_enabled, inst, awaiting };
  });
  if (!d) notFound();
  const diff = aiState(d.out, d.aiOn, (o) => o as AmendmentDiff);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={t("staff.amendment")} actions={<StatusBadge tone={d.am.status === "approved" ? "done" : d.am.status === "rejected" || d.am.status === "expired" ? "rejected" : "active"}>{t(`staff.amendmentStatus.${d.am.status}`)}</StatusBadge>} />
      <Card><CardTitle>{t("staff.justification")}</CardTitle><p className="text-body">{d.am.justification}</p></Card>
      <Card>
        <CardTitle>{t("staff.aiDiff")}</CardTitle>
        <DiffClient diff={diff} changes={d.am.changes} labels={{ amount: t("staff.newAmountShort"), deliverables: t("portal.deliverables") }} />
      </Card>
      {d.am.status === "submitted" && <form action={async () => { "use server"; await forwardAction(id); }}><SubmitButton>{t("staff.forward")}</SubmitButton></form>}
      {d.inst && d.awaiting && (
        <Card>
          <CardTitle>{t("staff.awaitingYou")}</CardTitle>
          <ActionForm action={amendmentApprovalAction.bind(null, id, d.inst.id)}>
            <select name="kind" aria-label={t("staff.decide")} className="rounded-md border border-border px-3 py-2"><option value="approve">{t("staff.approve")}</option><option value="reject">{t("staff.reject")}</option></select>
            <textarea name="note" aria-label={t("staff.note")} className="rounded-md border border-border p-2" />
            <SubmitButton>{t("staff.decide")}</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
