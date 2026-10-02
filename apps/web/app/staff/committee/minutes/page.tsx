import { approvalService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { MinutesClient } from "./MinutesClient";

export const dynamic = "force-dynamic";

/* C2 + C3 · R-045 R-047: upload the minutes, Manih extracts each decision, the secretary confirms. */
export default async function Minutes({ searchParams }: { searchParams: Promise<{ meeting?: string }> }) {
  const sp = await searchParams;
  const d = await asUser(async (ctx) => {
    const ready = await approvalService.committeeReady(ctx);
    let extraction = null as null | { status: string; decisions: Array<{ application_ref: string; decision: "approve" | "reject" | "defer"; amount_halalas: number | null; evidence: { file_id: string; page: number | null; span: null; excerpt: string } | null }>; outputId: string; error: string | null };
    if (sp.meeting) {
      const m = await ctx.tx.maybe<{ extract_output_id: string | null }>("select extract_output_id from approval.committee_meetings where id = $1", [sp.meeting]);
      if (m?.extract_output_id) {
        const o = await ctx.tx.maybe<{ id: string; status: string; output: { decisions: never[] } | null; error: string | null }>("select id, status, output, error from cycle.ai_outputs where id = $1", [m.extract_output_id]);
        if (o) extraction = { status: o.status, decisions: o.output?.decisions ?? [], outputId: o.id, error: o.error };
      }
    }
    return { ready: ready.map((r) => ({ id: r.subject_id, ref: r.ref, title: r.title, amount: r.amount_halalas })), extraction };
  });
  return <MinutesClient meetingId={sp.meeting ?? null} ready={d.ready} extraction={d.extraction} />;
}
