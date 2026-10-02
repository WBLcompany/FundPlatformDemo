"use server";
import { orgService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";
import { orgOf } from "@/lib/vm/portal";

export async function uploadDocAction(fd: FormData) {
  const file = fd.get("file") as File;
  if (!file || file.size === 0 || file.size > 10 * 1024 * 1024) return { ok: false as const, error: "الملف فارغ أو أكبر من 10 ميجابايت" };
  return run(() => asUser(async (ctx) => {
    const body = new Uint8Array(await file.arrayBuffer());
    return orgService.uploadDocument(ctx, { associationId: orgOf(ctx), file: { name: file.name, mime: file.type || "application/octet-stream", body } });
  }));
}
export async function confirmDocAction(documentId: string, v: { type: string; number: string | null; issueDate: string | null; expiryDate: string | null }) {
  return run(() => asUser((ctx) => orgService.confirmDocument(ctx, { documentId, ...v })));
}
