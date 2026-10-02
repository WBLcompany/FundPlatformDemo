import { notFound } from "next/navigation";
import { queries } from "@wbl/services";
import { DecisionRationaleView } from "@wbl/ui/views";
import { asUser } from "@/lib/auth";
import { fmtDate } from "@/lib/vm/status";

export const dynamic = "force-dynamic";

const ACTION: Record<string, string> = { approve: "اعتمد", reject: "رفض", return: "أعاد بملاحظات", modify_amount: "عدّل المبلغ" };

/* D2 · R-089: one page answers the whole decision. */
export default async function Rationale({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await asUser((ctx) => queries.rationale(ctx, id), { readOnly: true }).catch(() => null);
  if (!r) notFound();
  return <DecisionRationaleView appRef={r.app.ref} title={r.app.title} frameworkVersion={r.version}
    decision={r.app.decision === "approved" ? `موافقة بمبلغ ${((r.app.approved_halalas ?? 0) / 100).toLocaleString("en-US")} ريال` : r.app.decision === "rejected" ? "اعتذار" : "لم يصدر بعد"}
    decidedAt={r.app.decided_at ?? new Date().toISOString()}
    scores={r.scores.map((s) => ({ criterion: s.criterion, weight: s.weight, manih: s.manih, human: s.human ?? 0 }))}
    recommendations={r.recommendations}
    approvers={r.approvers.map((a) => ({ level: a.level, by: a.by, action: ACTION[a.action] ?? a.action, atLabel: fmtDate(a.at) }))}
    minutes={r.meeting ? { name: r.meeting.title, href: r.meeting.minutes_file_id ? `/api/files/${r.meeting.minutes_file_id}` : null, decisionLine: r.meeting.held_on } : null} />;
}
