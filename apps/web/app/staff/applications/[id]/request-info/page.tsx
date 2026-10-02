import { notFound } from "next/navigation";
import { ai, cycleService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { aiState } from "@/lib/vm/ai";
import { InfoClient } from "./InfoClient";

export const dynamic = "force-dynamic";

/* S4 · R-032 N-07: the draft comes from Manih (or nothing when AI is off); a person edits and sends. */
export default async function RequestInfo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await asUser(async (ctx) => {
    const app = await cycleService.getApplication(ctx, id).catch(() => null);
    if (!app) return null;
    const out = await ai.latestOutput(ctx, id, "message.draft");
    const donor = await ctx.tx.one<{ ai_enabled: boolean }>("select ai_enabled from platform.donors where id = app.tenant()");
    const pv = await cycleService.preview(ctx, id);
    const missing = [...pv.completeness.missing.map((k) => pv.program.form.properties[k]?.title ?? k), "عرض سعر معتمد لأعلى بند في الموازنة", "خطاب الشريك المنفذ إن وُجد"];
    return { ref: app.ref ?? "", draft: aiState(out, donor.ai_enabled, (o) => String((o as { text?: string }).text ?? "")), missing };
  });
  if (!d) notFound();
  return <InfoClient id={id} appRef={d.ref} draft={d.draft} missing={d.missing} />;
}
