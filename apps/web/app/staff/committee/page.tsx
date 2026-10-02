import { t } from "@/lib/i18n";
import { formatMoney } from "@wbl/ui";
import { approvalService, ai } from "@wbl/services";
import { CommitteePackView } from "@wbl/ui/views";
import { resolveRef } from "@wbl/kernel";
import { asUser } from "@/lib/auth";
import { aiState } from "@/lib/vm/ai";

export const dynamic = "force-dynamic";

/* C1 · R-046: the committee pack — summaries, recommendations, amounts, history. */
export default async function Committee() {
  const items = await asUser(async (ctx) => {
    const ready = await approvalService.committeeReady(ctx);
    const donor = await ctx.tx.one<{ ai_enabled: boolean }>("select ai_enabled from platform.donors where id = app.tenant()");
    return Promise.all(ready.map(async (r) => {
      const out = await ai.latestOutput(ctx, r.subject_id, "application.study_file");
      const sf = await ctx.tx.maybe<{ recommendation: string | null; rationale: string | null }>("select recommendation, rationale from cycle.study_files where application_id = $1", [r.subject_id]);
      const prior = await ctx.tx.one<{ n: number; s: number }>("select count(*)::int as n, coalesce(sum(approved_halalas),0)::bigint as s from cycle.applications where association_id = $1 and decision = 'approved' and id <> $2", [r.association_id, r.subject_id]);
      return {
        id: r.subject_id, ref: r.ref, title: r.title, association: resolveRef(ctx.actor, { kind: "association", id: r.association_id, label: r.association_name, orgId: r.association_id }),
        summary: aiState(out, donor.ai_enabled, (o) => (o as { summary?: { text: string } }).summary?.text),
        recommendation: sf?.rationale ?? "—", amountHalalas: r.amount_halalas,
        historyLine: prior.n ? t("committee.priorGrants", { n: prior.n, total: formatMoney(prior.s) }) : t("committee.noPriorGrants"),
      };
    }));
  }, { readOnly: true });
  return <CommitteePackView items={items} minutesHref="/staff/committee/minutes" />;
}
