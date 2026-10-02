import { notFound } from "next/navigation";
import { Card, CardTitle, PageHeader, SelectField, TextArea, StatusBadge, formatMoney } from "@wbl/ui";
import { AiSuggestion } from "@wbl/ui/ai";
import { ai } from "@wbl/services";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { asUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { aiState } from "@/lib/vm/ai";
import { decideFinalAction, unspentAction } from "../actions";

export const dynamic = "force-dynamic";

/* R-071–R-075: the final report, Manih's review, the specialist's judgement, settlement. */
export default async function FinalReport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await asUser(async (ctx) => {
    const fr = await ctx.tx.maybe<{ narrative: string; beneficiaries: number; female_beneficiaries: number | null; spent_halalas: number; unspent_halalas: number | null; unspent_disposition: string | null; status: string }>(
      "select narrative, beneficiaries, female_beneficiaries, spent_halalas, unspent_halalas, unspent_disposition, status from project.final_reports where project_id = $1", [id]);
    if (!fr) return null;
    const out = await ai.latestOutput(ctx, id, "final_report.review");
    const donor = await ctx.tx.one<{ ai_enabled: boolean }>("select ai_enabled from platform.donors where id = app.tenant()");
    return { fr, out, aiOn: donor.ai_enabled };
  }, { readOnly: true });
  if (!d) notFound();
  const review = aiState(d.out, d.aiOn, (o) => o as { notes: string[]; budget_vs_spent: { note: string }; planned_vs_achieved: Array<{ item: string; planned: string; achieved: string; met: boolean }> });
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <PageHeader title={t("staff.finalReport")} actions={<StatusBadge tone={d.fr.status === "accepted" ? "done" : "active"}>{d.fr.status}</StatusBadge>} />
      <Card>
        <p className="whitespace-pre-line text-body">{d.fr.narrative}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-body-sm md:grid-cols-4">
          <dt className="text-text-muted">{t("reports.beneficiaries")}</dt><dd className="font-mono">{d.fr.beneficiaries}</dd>
          <dt className="text-text-muted">{t("reports.female")}</dt><dd className="font-mono">{d.fr.female_beneficiaries ?? "—"}</dd>
          <dt className="text-text-muted">{t("reports.spent")}</dt><dd className="font-mono">{formatMoney(d.fr.spent_halalas)}</dd>
          <dt className="text-text-muted">{t("portal.unspent")}</dt><dd className="font-mono">{formatMoney(d.fr.unspent_halalas ?? 0)} {d.fr.unspent_disposition ? `· ${t(`portal.${d.fr.unspent_disposition}`)}` : ""}</dd>
        </dl>
      </Card>
      <Card>
        <AiSuggestion state={review} manual={null} render={(r) => (
          <ul className="flex flex-col gap-2 text-body-sm">{r.planned_vs_achieved.map((x) => <li key={x.item}>{x.item}: {x.planned} ← {x.achieved} {x.met ? "✓" : "✗"}</li>)}<li>{r.budget_vs_spent.note}</li></ul>
        )} />
      </Card>
      {d.fr.status === "submitted" && (
        <Card>
          <CardTitle>{t("staff.decide")}</CardTitle>
          <ActionForm action={decideFinalAction.bind(null, id)}>
            <SelectField label={t("staff.decide")} name="decision" options={[{ value: "accept", label: t("staff.accept") }, { value: "return", label: t("staff.return") }]} />
            <SelectField label="تقييم الأداء" name="rating" options={["أ", "ب", "ج", "د"].map((x) => ({ value: x, label: x }))} />
            <TextArea label={t("staff.note")} name="note" />
            <SubmitButton>{t("staff.decide")}</SubmitButton>
          </ActionForm>
        </Card>
      )}
      {d.fr.status === "accepted" && (d.fr.unspent_halalas ?? 0) > 0 && !d.fr.unspent_disposition && (
        <Card>
          <CardTitle>{t("portal.unspent")}</CardTitle>
          <ActionForm action={unspentAction.bind(null, id)}>
            <SelectField label={t("portal.unspent")} name="disposition" options={["returned", "reallocated", "waived"].map((x) => ({ value: x, label: t(`portal.${x}`) }))} />
            <SubmitButton>{t("staff.closeProject")}</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
