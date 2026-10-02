import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Card, CardTitle, PageHeader, SelectField, StatusBadge, Table, TextArea, TextField, formatMoney } from "@wbl/ui";
import { financeService, orgService, projectService } from "@wbl/services";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { asUser } from "@/lib/auth";
import { run } from "@/lib/actions";
import { t } from "@/lib/i18n";
import { orgOf } from "@/lib/vm/portal";
import { DEL_LABEL, INST_LABEL, PROJECT_LABEL, delTone, fmtDate, instTone, projectTone } from "@/lib/vm/status";

export const dynamic = "force-dynamic";

/* «مشاريعي»: deliverables (P2), receipts (R-067), amendment request (R-055), final report (R-071). */
export default async function MyProject({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await asUser(async (ctx) => {
    const p = await ctx.tx.maybe<{ id: string; ref: string; status: string; approved_halalas: number; application_id: string }>("select id, ref, status, approved_halalas, application_id from project.projects where id = $1", [id]);
    if (!p) return null;
    const app = await ctx.tx.one<{ title: string }>("select title from cycle.applications where id = $1", [p.application_id]);
    const dels = await ctx.tx.query<{ id: string; label: string; due_date: string; status: string }>("select id, label, to_char(due_date,'YYYY-MM-DD') as due_date, status from project.deliverables where project_id = $1 order by seq", [id]);
    const inst = await ctx.tx.query<{ id: string; label: string; amount_halalas: number; status: string }>("select id, label, amount_halalas, status from finance.installments where project_id = $1 order by seq", [id]);
    const orders = await ctx.tx.query<{ id: string; ref: string; amount_halalas: number; receipt_due_at: string | null; receipt_received_at: string | null }>("select id, ref, amount_halalas, receipt_due_at, receipt_received_at from finance.disbursement_orders where project_id = $1 and status = 'executed'", [id]);
    const fr = await ctx.tx.maybe<{ status: string }>("select status from project.final_reports where project_id = $1", [id]);
    return { p, app, dels, inst, orders, fr };
  }, { readOnly: true });
  if (!d) notFound();
  async function receipt(orderId: string, _: unknown, fd: FormData) {
    "use server";
    const file = fd.get("file") as File;
    const r = await run(() => asUser(async (ctx) => {
      const fileId = await orgService.storeFile(ctx, { name: file.name, mime: file.type || "application/pdf", body: new Uint8Array(await file.arrayBuffer()), ownerOrgId: orgOf(ctx) });
      await financeService.uploadReceipt(ctx, orderId, fileId);
    }), t("portal.receiptDone"));
    revalidatePath(`/portal/projects/${id}`);
    return r;
  }
  async function amendment(_: unknown, fd: FormData) {
    "use server";
    const amount = fd.get("amount") ? Math.round(Number(fd.get("amount")) * 100) : undefined;
    return run(() => asUser((ctx) => projectService.requestAmendment(ctx, id, { justification: String(fd.get("justification") ?? ""), amountHalalas: amount })), t("app.saved"));
  }
  async function finalReport(_: unknown, fd: FormData) {
    "use server";
    const r = await run(() => asUser((ctx) => projectService.submitFinalReport(ctx, id, {
      narrative: String(fd.get("narrative") ?? ""), beneficiaries: Number(fd.get("beneficiaries") ?? 0), femaleBeneficiaries: fd.get("female") ? Number(fd.get("female")) : null,
      outputs: {}, spentHalalas: Math.round(Number(fd.get("spent") ?? 0) * 100), unspentDisposition: (String(fd.get("unspent") ?? "") || null) as "returned" | null, fileIds: [] })), t("app.saved"));
    revalidatePath(`/portal/projects/${id}`);
    return r;
  }
  const allDelivered = d.dels.every((x) => x.status === "accepted");
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 py-6 pb-24 md:pb-6">
      <PageHeader title={d.app.title} eyebrow={<span className="font-mono text-caption">{d.p.ref}</span>} actions={<StatusBadge tone={projectTone[d.p.status] ?? "neutral"}>{PROJECT_LABEL[d.p.status]}</StatusBadge>} />
      <Card>
        <CardTitle>{t("portal.deliverables")}</CardTitle>
        <Table caption={t("portal.deliverables")} rows={d.dels} rowKey={(r) => r.id} columns={[
          { key: "l", header: t("portal.deliverables"), cell: (r) => (["pending", "returned"].includes(r.status) ? <a className="text-link hover:underline" href={`/portal/deliverables/${r.id}`}>{r.label}</a> : r.label) },
          { key: "d", header: "", cell: (r) => fmtDate(r.due_date) },
          { key: "s", header: "", cell: (r) => <StatusBadge tone={delTone[r.status] ?? "neutral"}>{DEL_LABEL[r.status]}</StatusBadge> },
        ]} />
      </Card>
      <Card>
        <CardTitle>{t("nav.finance")}</CardTitle>
        <Table caption={t("nav.finance")} rows={d.inst} rowKey={(r) => r.id} columns={[
          { key: "l", header: "", cell: (r) => r.label },
          { key: "a", header: t("staff.amount"), mono: true, cell: (r) => formatMoney(r.amount_halalas, false) },
          { key: "s", header: "", cell: (r) => <StatusBadge tone={instTone[r.status] ?? "neutral"}>{INST_LABEL[r.status]}</StatusBadge> },
        ]} />
        {d.orders.filter((o) => !o.receipt_received_at).map((o) => (
          <ActionForm key={o.id} action={receipt.bind(null, o.id)} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-caption font-medium">{t("portal.receipt")} — <span className="font-mono">{o.ref}</span> ({fmtDate(o.receipt_due_at)})<input type="file" name="file" required /></label>
            <SubmitButton variant="secondary">{t("portal.receipt")}</SubmitButton>
          </ActionForm>
        ))}
      </Card>
      {(d.p.status === "active" && allDelivered && (!d.fr || d.fr.status === "returned")) && (
        <Card>
          <CardTitle>{t("portal.finalReport")}</CardTitle>
          <ActionForm action={finalReport}>
            <TextArea label={t("portal.narrative")} name="narrative" required />
            <TextField label={t("portal.beneficiaries")} name="beneficiaries" type="number" dir="ltr" required />
            <TextField label={t("portal.female")} name="female" type="number" dir="ltr" />
            <TextField label={t("portal.spent")} name="spent" type="number" dir="ltr" required />
            <SelectField label={t("portal.unspent")} name="unspent" options={[{ value: "", label: "—" }, ...["returned", "reallocated", "waived"].map((x) => ({ value: x, label: t(`portal.${x}`) }))]} />
            <SubmitButton>{t("portal.submitFinal")}</SubmitButton>
          </ActionForm>
        </Card>
      )}
      {d.p.status === "active" && (
        <Card>
          <CardTitle>{t("staff.requestAmendment")}</CardTitle>
          <ActionForm action={amendment}><TextArea label={t("staff.justification")} name="justification" required /><TextField label={t("staff.newAmount")} name="amount" type="number" dir="ltr" /><SubmitButton variant="secondary">{t("staff.requestAmendment")}</SubmitButton></ActionForm>
        </Card>
      )}
    </div>
  );
}
