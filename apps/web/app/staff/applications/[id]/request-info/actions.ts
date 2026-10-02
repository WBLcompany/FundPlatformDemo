"use server";
import { redirect } from "next/navigation";
import { cycleService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";

export async function sendInfoAction(id: string, message: string, items: string[]) {
  const r = await run(() => asUser((ctx) => cycleService.requestInfo(ctx, id, { items, message })));
  if (r.ok) redirect(`/staff/applications/${id}`);
  return r;
}
export async function draftAction(id: string, items: string[]) {
  return run(() => asUser((ctx) => cycleService.draftInfoMessage(ctx, id, items)));
}
