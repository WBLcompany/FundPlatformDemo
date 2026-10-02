"use server";
import { ai, cycleService, orgService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";

export async function saveFormAction(id: string, values: Record<string, string>) {
  return run(() => asUser((ctx) => cycleService.saveForm(ctx, id, values)));
}
export async function previewAction(id: string) {
  return run(() => asUser(async (ctx) => {
    const pv = await cycleService.preview(ctx, id);
    return {
      checks: [
        ...pv.readiness.items.filter((i) => !i.ok).map((i) => ({ key: i.key, label: i.label, passed: false, detail: `${i.label}: ${i.reason ?? ""}` })),
        ...pv.program.eligibility.rules.map((r) => { const hit = pv.eligibility.reasons.find((x) => x.ruleId === r.id); return { key: r.id, label: r.label ?? r.reason, passed: !hit, detail: hit ? hit.reason : (r.label ?? r.reason) }; }),
      ],
      completeness: pv.completeness,
    };
  }));
}
export async function submitAction(id: string) {
  return run(() => asUser((ctx) => cycleService.submit(ctx, id)));
}
/* N-03: «استخدم مقترحاً جاهزاً» — Manih turns an external proposal into a draft; nothing is sent before review. */
export async function prefillAction(id: string, fd: FormData) {
  const file = fd.get("file") as File;
  return run(() => asUser(async (ctx) => {
    const app = await cycleService.getApplication(ctx, id);
    const body = new Uint8Array(await file.arrayBuffer());
    const fileId = await orgService.storeFile(ctx, { name: file.name, mime: file.type || "application/octet-stream", body, ownerOrgId: app.association_id, text: file.type.startsWith("text/") ? new TextDecoder().decode(body) : null });
    const pv = await cycleService.preview(ctx, id);
    return ai.requestTask(ctx, { task: "proposal.prefill", subjectKind: "application", subjectId: id, inputs: { form_keys: Object.keys(pv.program.form.properties), form_schema: pv.program.form, attachments: [{ id: fileId, name: file.name }] } });
  }));
}
export async function prefillResultAction(id: string) {
  return asUser((ctx) => ai.latestOutput(ctx, id, "proposal.prefill"), { readOnly: true }).catch(() => null);
}
export async function attachAction(id: string, fd: FormData) {
  const file = fd.get("file") as File;
  return run(() => asUser(async (ctx) => {
    const app = await cycleService.getApplication(ctx, id);
    const body = new Uint8Array(await file.arrayBuffer());
    const fileId = await orgService.storeFile(ctx, { name: file.name, mime: file.type || "application/octet-stream", body, ownerOrgId: app.association_id, text: file.type.startsWith("text/") ? new TextDecoder().decode(body) : null });
    const atts = [...((app.form_data.__attachments as string[]) ?? []), fileId];
    await ctx.tx.query("update cycle.applications set form_data = form_data || jsonb_build_object('__attachments', $3::jsonb), version = version + 1 where id = $1 and version = $2", [id, app.version, JSON.stringify(atts)]);
    return { fileId, name: file.name };
  }));
}
