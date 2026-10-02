"use server";
import { orgService, projectService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";
import { orgOf } from "@/lib/vm/portal";

export async function submitDeliverableAction(id: string, fd: FormData) {
  const files = fd.getAll("files") as File[];
  return run(() => asUser(async (ctx) => {
    const ids: string[] = [];
    for (const f of files) {
      const body = new Uint8Array(await f.arrayBuffer());
      ids.push(await orgService.storeFile(ctx, { name: f.name, mime: f.type || "application/octet-stream", body, ownerOrgId: orgOf(ctx), text: f.type.startsWith("text/") ? new TextDecoder().decode(body) : null }));
    }
    await projectService.submitDeliverable(ctx, id, { fileIds: ids, beneficiaries: Number(fd.get("beneficiaries")), spentHalalas: Number(fd.get("spent")), note: String(fd.get("note") ?? "") });
  }));
}
