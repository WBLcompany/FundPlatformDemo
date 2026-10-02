"use server";
import { t } from "@/lib/i18n";
import { revalidatePath } from "next/cache";
import { approvalService, projectService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";

export async function forwardAction(id: string) {
  await run(() => asUser((ctx) => projectService.forwardAmendment(ctx, id)));
  revalidatePath(`/staff/amendments/${id}`);
}
export async function amendmentApprovalAction(id: string, instanceId: string, _: unknown, fd: FormData) {
  const kind = String(fd.get("kind")) as "approve" | "reject";
  const r = await run(() => asUser((ctx) => approvalService.act(ctx, instanceId, { kind, note: String(fd.get("note") ?? "") || "—" })), t("staff.msg.actionRecorded"));
  revalidatePath(`/staff/amendments/${id}`);
  return r;
}
