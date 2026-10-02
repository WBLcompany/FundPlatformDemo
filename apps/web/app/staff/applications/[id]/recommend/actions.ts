"use server";
import { redirect } from "next/navigation";
import { approvalService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";

export async function recommendAction(id: string, decision: string, amountHalalas: number, rationale: string) {
  const r = await run(() => asUser((ctx) => approvalService.submitRecommendation(ctx, id, { decision: decision as "approve", amountHalalas, rationale })));
  if (r.ok) redirect(`/staff/applications/${id}`);
  return r;
}
