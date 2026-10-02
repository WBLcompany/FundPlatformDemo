import { notFound } from "next/navigation";
import { ai, projectService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { aiState } from "@/lib/vm/ai";
import { DeliverableClient } from "./DeliverableClient";

export const dynamic = "force-dynamic";

/* P3 · R-052 R-053: Manih's match against the agreement item; the specialist decides. */
export default async function Deliverable({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await asUser(async (ctx) => {
    const del = await projectService.getDeliverable(ctx, id).catch(() => null);
    if (!del) return null;
    const out = await ai.latestOutput(ctx, id, "deliverable.review");
    const donor = await ctx.tx.one<{ ai_enabled: boolean }>("select ai_enabled from platform.donors where id = app.tenant()");
    const sub = await ctx.tx.one<{ submission: { beneficiaries: number; spent_halalas: number; note: string } | null; file_ids: string[] }>("select submission, file_ids from project.deliverables where id = $1", [id]);
    return { del, out, aiOn: donor.ai_enabled, sub };
  }, { readOnly: true });
  if (!d) notFound();
  const review = aiState(d.out, d.aiOn, (o) => {
    const v = o as { matches: Array<{ requirement: string; met: boolean; note: string }>; gaps: string[] };
    return { matches: v.matches.map((m) => ({ requirement: m.requirement, met: m.met, note: m.note })), gaps: v.gaps };
  });
  return <DeliverableClient id={d.del.id} projectId={d.del.project_id} label={d.del.label} status={d.del.status} review={review} submission={d.sub.submission} fileIds={d.sub.file_ids} />;
}
