"use server";
import { orgService, projectService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";
import { orgOf } from "@/lib/vm/portal";

export async function signAction(id: string, fd: FormData) {
  const file = fd.get("file") as File;
  return run(() => asUser(async (ctx) => {
    const fileId = await orgService.storeFile(ctx, { name: file.name, mime: file.type || "application/pdf", body: new Uint8Array(await file.arrayBuffer()), ownerOrgId: orgOf(ctx) });
    await projectService.associationSign(ctx, id, fileId);
  }));
}
