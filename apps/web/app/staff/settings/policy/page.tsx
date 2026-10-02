import { revalidatePath } from "next/cache";
import { Card, CardTitle, FileInput, PageHeader, StatusBadge, TextArea } from "@wbl/ui";
import { ai, frameworkService, orgService } from "@wbl/services";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/* G2 · R-003 R-005: policy drafted by Manih from the donor's files (or typed by hand), approved by a person. */
export default async function Policy() {
  const d = await asUser(async (ctx) => {
    const p = await ctx.tx.maybe<{ id: string; clauses: Array<{ text: string; source: string | null }>; status: string; ai_output_id: string | null }>("select id, clauses, status, ai_output_id from framework.policies order by created_at desc limit 1");
    const out = p ? await ai.latestOutput(ctx, p.id, "policy.draft") : null;
    return { p, out };
  });
  async function upload(_: unknown, fd: FormData) {
    "use server";
    const files = fd.getAll("files") as File[];
    const r = await run(() => asUser(async (ctx) => {
      const ids: string[] = [];
      for (const f of files.filter((x) => x.size > 0)) {
        const body = new Uint8Array(await f.arrayBuffer());
        ids.push(await orgService.storeFile(ctx, { name: f.name, mime: f.type || "application/octet-stream", body, ownerOrgId: null, text: f.type.startsWith("text/") ? new TextDecoder().decode(body) : null }));
      }
      return frameworkService.requestPolicyDraft(ctx, ids, {});
    }), t("app.saved"));
    revalidatePath("/staff/settings/policy");
    return r;
  }
  async function save(_: unknown, fd: FormData) {
    "use server";
    const lines = String(fd.get("clauses") ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((text) => ({ text, source: null }));
    const r = await run(() => asUser(async (ctx) => {
      let id = String(fd.get("policyId") ?? "");
      if (!id) id = (await ctx.tx.one<{ id: string }>("insert into framework.policies (tenant_id) values (app.tenant()) returning id")).id;
      await frameworkService.savePolicyClauses(ctx, id, lines);
    }), t("app.saved"));
    revalidatePath("/staff/settings/policy");
    return r;
  }
  async function approve(id: string) { "use server"; await run(() => asUser((ctx) => frameworkService.approvePolicy(ctx, id))); revalidatePath("/staff/settings/policy"); }
  const aiClauses = (d.out?.output as { clauses?: Array<{ text: string; source: string | null }> } | null)?.clauses ?? [];
  const clauses = d.p?.clauses.length ? d.p.clauses : aiClauses;
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader title={t("settings.policy")} actions={d.p && <StatusBadge tone={d.p.status === "approved" ? "done" : "active"}>{d.p.status}</StatusBadge>} />
      <Card>
        <CardTitle>{t("settings.draftPolicy")}</CardTitle>
        <ActionForm action={upload}><FileInput label={t("settings.policyFiles")} name="files" multiple accept=".pdf,.docx,.txt" /><SubmitButton variant="secondary">{t("settings.draftPolicy")}</SubmitButton></ActionForm>
        {d.out?.status === "pending" && <p className="mt-2 text-body-sm text-ai-text">…</p>}
      </Card>
      <Card>
        <CardTitle>{t("settings.policyClauses")}</CardTitle>
        <ActionForm action={save}>
          <input type="hidden" name="policyId" value={d.p?.id ?? ""} />
          <TextArea label={t("settings.policyClauses")} name="clauses" defaultValue={clauses.map((c) => c.text).join("\n")} className="min-h-64" />
          <SubmitButton variant="secondary">{t("settings.savePolicy")}</SubmitButton>
        </ActionForm>
        {d.p && d.p.status === "draft" && d.p.clauses.length > 0 && <form action={approve.bind(null, d.p.id)} className="mt-3"><SubmitButton>{t("settings.approvePolicy")}</SubmitButton></form>}
      </Card>
    </div>
  );
}
