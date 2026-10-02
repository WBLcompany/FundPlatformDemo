import { notFound, redirect } from "next/navigation";
import { cycleService } from "@wbl/services";
import type { FormFieldVM } from "@wbl/ui/views";
import { asUser } from "@/lib/auth";
import { EditClient } from "./EditClient";

export const dynamic = "force-dynamic";

/* J6 · R-019 R-022 N-02 N-03: the form from the framework's JSON Schema, autosave, deterministic preview. */
export default async function Edit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await asUser(async (ctx) => {
    const app = await cycleService.getApplication(ctx, id).catch(() => null);
    if (!app) return null;
    const pv = await cycleService.preview(ctx, id);
    const donor = await ctx.tx.one<{ ai_enabled: boolean }>("select ai_enabled from platform.donors where id = app.tenant()");
    return { app, pv, aiOn: donor.ai_enabled };
  });
  if (!d) notFound();
  if (d.app.status !== "draft" && d.app.status !== "awaiting_info") redirect(`/portal/applications/${id}`);
  const form = d.pv.program.form;
  const fields: FormFieldVM[] = Object.entries(form.properties).map(([key, p]) => ({ key, label: p.title, kind: p["x-widget"] === "textarea" ? "textarea" : p.type === "string" ? "text" : "number", required: form.required.includes(key), step: p["x-step"], hint: p.description }));
  const values = Object.fromEntries(Object.entries(d.app.form_data).filter(([k]) => !k.startsWith("__")).map(([k, v]) => [k, String(v ?? "")]));
  return <EditClient id={id} programName={d.pv.program.name} steps={form["x-steps"]} fields={fields} initialValues={values} aiOn={d.aiOn} resubmit={d.app.status === "awaiting_info"} attachments={((d.app.form_data.__attachments as string[]) ?? [])} />;
}
