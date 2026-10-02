"use server";
import { approvalService, orgService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";

export async function uploadMinutesAction(fd: FormData) {
  const file = fd.get("file") as File;
  const ids = JSON.parse(String(fd.get("ids") ?? "[]")) as string[];
  return run(() => asUser(async (ctx) => {
    const body = new Uint8Array(await file.arrayBuffer());
    const text = file.type.startsWith("text/") ? new TextDecoder().decode(body) : null;
    const fileId = await orgService.storeFile(ctx, { name: file.name, mime: file.type || "application/octet-stream", body, ownerOrgId: null, text });
    return approvalService.createMeeting(ctx, { title: String(fd.get("title") || "اجتماع اللجنة"), heldOn: String(fd.get("heldOn") || new Date().toISOString().slice(0, 10)), minutesFileId: fileId, applicationIds: ids });
  }));
}

export async function confirmAction(meetingId: string, rows: Array<{ applicationId: string; decision: "approve" | "reject" | "defer"; amountHalalas: number | null }>) {
  return run(() => asUser((ctx) => approvalService.confirmCommitteeDecisions(ctx, meetingId, rows)));
}
