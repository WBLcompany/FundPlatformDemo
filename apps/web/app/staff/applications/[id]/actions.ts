"use server";
import { t } from "@/lib/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ai, approvalService, cycleService, versionConfig, programOf } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";

const path = (id: string) => `/staff/applications/${id}`;

export async function saveScoreAction(id: string, criterionName: string, score: number) {
  return run(() => asUser(async (ctx) => {
    const app = await cycleService.getApplication(ctx, id);
    const p = programOf((await versionConfig(ctx.tx, app.framework_version_id)).config, app.program_id);
    const c = p.criteria.find((x) => x.name === criterionName);
    if (!c || !Number.isFinite(score) || score < 0 || score > c.max) return;
    if (app.study_mode === "independent") {
      // In independent mode the scores are recorded only through «سجّل تقييمي واكشف»; keep them in the draft judgement.
    }
    await cycleService.saveJudgement(ctx, id, { scores: { [c.key]: score } });
  }));
}

export async function recordAndRevealAction(id: string) {
  const r = await run(() => asUser(async (ctx) => {
    const sf = await cycleService.getStudyFile(ctx, id);
    await cycleService.recordAssessment(ctx, id, sf?.scores ?? {});
  }));
  revalidatePath(path(id));
  return r;
}

export async function judgementAction(id: string, _: unknown, fd: FormData) {
  const lines = String(fd.get("schedule") ?? "").split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((x) => x.length === 5);
  const schedule = lines.map(([label, percent, condition, deliverable, days]) => ({ label: label!, percent: Number(percent), condition: condition as "signature", deliverable: deliverable!, due_offset_days: Number(days) }));
  const r = await run(() => asUser((ctx) => cycleService.saveJudgement(ctx, id, { summary: String(fd.get("summary") ?? "") || undefined, schedule: schedule.length ? schedule : undefined })), t("staff.judgementSaved"));
  revalidatePath(path(id));
  return r;
}

export async function conflictAction(id: string) {
  await run(() => asUser((ctx) => cycleService.declareConflict(ctx, id, null)));
  redirect("/staff");
}

export async function approvalAction(id: string, instanceId: string, _: unknown, fd: FormData) {
  const kind = String(fd.get("kind")) as "approve" | "reject" | "return" | "modify_amount";
  const amount = fd.get("amount") ? Math.round(Number(fd.get("amount")) * 100) : undefined;
  const r = await run(() => asUser((ctx) => approvalService.act(ctx, instanceId, { kind, note: String(fd.get("note") ?? ""), amountHalalas: amount })), t("staff.msg.actionRecorded"));
  revalidatePath(path(id));
  return r;
}

export async function feedbackAction(outputId: string, helpful: boolean, reason?: string) {
  return run(() => asUser((ctx) => ai.recordFeedback(ctx, outputId, helpful, reason)));
}

export async function requestStudyAction(id: string) {
  const r = await run(() => asUser((ctx) => cycleService.requestStudyFile(ctx, id)));
  revalidatePath(path(id));
  return r;
}
