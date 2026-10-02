import { notFound } from "next/navigation";
import { approval } from "@wbl/domain";
import { ai, cycleService, programOf, versionConfig } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { RecommendClient } from "./RecommendClient";

export const dynamic = "force-dynamic";

/* S5 · R-038: the recommendation, with the approval levels it will pass (R-042). */
export default async function Recommend({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await asUser(async (ctx) => {
    const app = await cycleService.getApplication(ctx, id).catch(() => null);
    if (!app) return null;
    const cfg = (await versionConfig(ctx.tx, app.framework_version_id)).config;
    const p = programOf(cfg, app.program_id);
    const out = await ai.latestOutput(ctx, id, "application.study_file");
    const rec = (out?.sealed as { recommendation?: { decision: string; amount_halalas: number } } | null)?.recommendation;
    const chain = cfg.approvalChains.find((c) => c.id === p.approvalChainId)!;
    const amount = rec?.amount_halalas ?? app.requested_halalas ?? 0;
    return { ref: app.ref ?? "", suggested: rec ? { decision: rec.decision, amountHalalas: rec.amount_halalas } : { decision: "approve", amountHalalas: app.requested_halalas ?? 0 }, chain: approval.applicableLevels(chain, { amountHalalas: amount }).map((l) => l.label) };
  });
  if (!d) notFound();
  return <RecommendClient id={id} appRef={d.ref} suggested={d.suggested} chain={d.chain} labels={{ rationale: t("staff.recRationale") }} />;
}
