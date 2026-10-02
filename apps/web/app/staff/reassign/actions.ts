"use server";
import { cycleService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";

export async function reassignAction(ids: string[], to: string | null, reason: string, handover: string) {
  return run(() => asUser((ctx) => cycleService.reassign(ctx, ids, to, reason, handover || null)));
}
