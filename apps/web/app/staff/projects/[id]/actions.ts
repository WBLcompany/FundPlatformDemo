"use server";
import { revalidatePath } from "next/cache";
import { projectService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";

export async function amendmentAction(id: string, _: unknown, fd: FormData) {
  const amount = fd.get("amount") ? Math.round(Number(fd.get("amount")) * 100) : undefined;
  const r = await run(() => asUser((ctx) => projectService.requestAmendment(ctx, id, { justification: String(fd.get("justification") ?? ""), amountHalalas: amount })), "أُرسل طلب التعديل إلى مسار الاعتماد");
  revalidatePath(`/staff/projects/${id}`);
  return r;
}
export async function closeAction(id: string) {
  const r = await run(() => asUser((ctx) => projectService.tryClose(ctx, id)));
  revalidatePath(`/staff/projects/${id}`);
  return r;
}
export async function decideFinalAction(id: string, _: unknown, fd: FormData) {
  const accept = fd.get("decision") === "accept";
  const r = await run(() => asUser((ctx) => projectService.decideFinalReport(ctx, id, { accept, note: String(fd.get("note") ?? ""), rating: String(fd.get("rating") ?? "") || null, ratingNote: String(fd.get("ratingNote") ?? "") || null })));
  revalidatePath(`/staff/projects/${id}`);
  if (r.ok && r.data && !r.data.closed && r.data.blockers.length) return { ok: true as const, message: `قُبل التقرير. لم يُقفل المشروع بعد: ${r.data.blockers.join("، ")}` };
  return r.ok ? { ...r, message: accept ? (r.data?.closed ? "قُبل التقرير وأُقفل المشروع" : "قُبل التقرير") : "أُعيد التقرير للجمعية" } : r;
}
export async function unspentAction(id: string, _: unknown, fd: FormData) {
  const r = await run(() => asUser(async (ctx) => {
    await ctx.tx.query("update project.final_reports set unspent_disposition = $2, version = version + 1 where project_id = $1", [id, String(fd.get("disposition"))]);
    return projectService.tryClose(ctx, id);
  }));
  revalidatePath(`/staff/projects/${id}`);
  return r.ok ? { ok: true as const, message: r.data?.closed ? "أُقفل المشروع" : `لم يُقفل بعد: ${r.data?.blockers.join("، ")}` } : r;
}
