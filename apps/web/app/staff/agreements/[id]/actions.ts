"use server";
import { projectService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";

export async function donorSignAction(id: string) {
  return run(() => asUser((ctx) => projectService.donorSign(ctx, id)));
}
