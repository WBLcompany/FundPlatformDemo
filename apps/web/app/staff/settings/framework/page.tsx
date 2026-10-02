import { revalidatePath } from "next/cache";
import { Alert, Card, CardTitle, PageHeader, TextArea, TextField } from "@wbl/ui";
import { FrameworkVersionView } from "@wbl/ui/views";
import { framework } from "@wbl/domain";
import { frameworkService } from "@wbl/services";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/* G3 + G4 · R-001 R-004 R-005 R-087: the draft (all settings as data), validation, simulation, approval into a numbered version. */
export default async function Framework() {
  const d = await asUser(async (ctx) => {
    const draft = await frameworkService.getDraft(ctx);
    const versions = await frameworkService.listVersions(ctx);
    const v = framework.validateConfig(draft.config);
    return { draft, versions, errors: v.ok ? [] : v.errors };
  });
  async function save(_: unknown, fd: FormData) {
    "use server";
    let parsed: unknown;
    try { parsed = JSON.parse(String(fd.get("config"))); } catch { return { ok: false, error: "JSON غير صالح" }; }
    const r = await run(() => asUser((ctx) => frameworkService.saveDraft(ctx, parsed, Number(fd.get("revision")))), t("app.saved"));
    revalidatePath("/staff/settings/framework");
    return r;
  }
  async function approve(_: unknown, fd: FormData) {
    "use server";
    const r = await run(() => asUser((ctx) => frameworkService.approveDraft(ctx, String(fd.get("reason") ?? ""))));
    revalidatePath("/staff/settings/framework");
    return r.ok ? { ok: true, message: `${r.data!.number}: ${r.data!.changes.join("، ")}` } : r;
  }
  async function simulate() {
    "use server";
    const r = await run(() => asUser((ctx) => frameworkService.simulateDraft(ctx)));
    return r.ok ? { ok: true, message: `${r.data!.evaluated} / ${r.data!.refused} / ${r.data!.matchedDecision}` } : r;
  }
  const latest = d.versions[0];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("settings.draftEditor")} description={t("settings.draftHint")} />
      {d.errors.length > 0 && <Alert tone="warning" title={t("settings.errors")}><ul className="list-disc ps-5">{d.errors.map((e) => <li key={e} dir="ltr" className="font-mono">{e}</li>)}</ul></Alert>}
      <Card>
        <ActionForm action={save}>
          <input type="hidden" name="revision" value={d.draft.revision} />
          <TextArea label={t("settings.draftEditor")} name="config" defaultValue={JSON.stringify(d.draft.config, null, 2)} className="min-h-[480px] font-mono text-caption" dir="ltr" />
          <SubmitButton variant="secondary">{t("settings.saveDraft")}</SubmitButton>
        </ActionForm>
      </Card>
      <Card><ActionForm action={simulate}><SubmitButton variant="secondary">{t("settings.simulate")}</SubmitButton></ActionForm></Card>
      <Card>
        <CardTitle>{t("settings.approve")}</CardTitle>
        <ActionForm action={approve}><TextField label={t("settings.reason")} name="reason" required /><SubmitButton>{t("settings.approve")}</SubmitButton></ActionForm>
      </Card>
      {latest && <FrameworkVersionView number={latest.number} approvedBy={latest.approved_by_name} approvedAt={latest.approved_at} reason={latest.reason} changes={latest.changes} />}
      <Card><CardTitle>{t("settings.versions")}</CardTitle><ul className="flex flex-col gap-1 text-body-sm">{d.versions.map((v) => <li key={v.id}><span className="font-mono">{v.number}</span> — {v.reason} — {v.approved_by_name}</li>)}</ul></Card>
    </div>
  );
}
