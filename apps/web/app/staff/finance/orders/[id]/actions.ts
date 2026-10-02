"use server";
import { revalidatePath } from "next/cache";
import { approvalService, financeService, orgService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";

const p = (id: string) => `/staff/finance/orders/${id}`;
export async function executeAction(id: string, fd: FormData) {
  const file = fd.get("proof") as File;
  const r = await run(() => asUser(async (ctx) => {
    const fileId = await orgService.storeFile(ctx, { name: file.name, mime: file.type || "application/octet-stream", body: new Uint8Array(await file.arrayBuffer()), ownerOrgId: null });
    await financeService.execute(ctx, id, { proofFileId: fileId, financeRef: String(fd.get("financeRef") ?? "") || null });
  }));
  revalidatePath(p(id));
  return r;
}
export async function returnAction(id: string, reason: string) {
  const r = await run(() => asUser((ctx) => financeService.returnOrder(ctx, id, reason)));
  revalidatePath(p(id));
  return r;
}
export async function approveOrderAction(id: string, instanceId: string) {
  await run(() => asUser((ctx) => approvalService.act(ctx, instanceId, { kind: "approve" })));
  revalidatePath(p(id));
}
export async function recheckAction(id: string) {
  await run(() => asUser((ctx) => financeService.recheckOrder(ctx, id)));
  revalidatePath(p(id));
}
export async function resolveAction(id: string, _: unknown, fd: FormData) {
  const r = await run(() => asUser((ctx) => financeService.resolveReturn(ctx, id, String(fd.get("note") ?? ""))), "أُعيد الأمر إلى المالية");
  revalidatePath(p(id));
  return r;
}
