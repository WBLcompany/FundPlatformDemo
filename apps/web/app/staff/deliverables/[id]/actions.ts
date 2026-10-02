"use server";
import { projectService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";

export async function decideDeliverableAction(id: string, decision: "accepted" | "returned" | "rejected", note: string) {
  return run(() => asUser((ctx) => projectService.decideDeliverable(ctx, id, decision, note)));
}
