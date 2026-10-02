import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AssociationPageView } from "@wbl/ui/views";
import { ai, orgService, queries } from "@wbl/services";
import { resolveRef } from "@wbl/kernel";
import { SubmitButton } from "@/components/ActionForm";
import { asUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { aiState } from "@/lib/vm/ai";
import { appTone, fmtDate, statusLabel } from "@/lib/vm/status";

export const dynamic = "force-dynamic";

/* D1 · R-097 R-037: the association on the entity template; letter registrations are reviewed here (R-011). */
export default async function Association({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await asUser(async (ctx) => {
    const a = await ctx.tx.maybe<{ id: string; name: string; license_no: string; city: string | null; status: string; rating: string | null; registered_via: string; letter_file_id: string | null }>(
      "select id, name, license_no, city, status, rating, registered_via, letter_file_id from org.associations where id = $1", [id]);
    if (!a) return null;
    const apps = await ctx.tx.query<{ id: string; ref: string; title: string; status: string; approved_halalas: number | null }>("select id, ref, title, status, approved_halalas from cycle.applications where association_id = $1 and status <> 'draft' order by submitted_at desc", [id]);
    const spent = await ctx.tx.one<{ s: number }>("select coalesce(sum(amount_halalas),0)::bigint as s from finance.disbursement_orders where association_id = $1 and status = 'executed'", [id]);
    const evals = await ctx.tx.query<{ project_id: string; performance_rating: string | null; performance_note: string | null }>("select f.project_id, f.performance_rating, f.performance_note from project.final_reports f join project.projects p on p.tenant_id = f.tenant_id and p.id = f.project_id where p.association_id = $1 and f.status = 'accepted'", [id]);
    const activity = await queries.activity(ctx, "association", id);
    const donor = await ctx.tx.one<{ ai_enabled: boolean }>("select ai_enabled from platform.donors where id = app.tenant()");
    const open = apps.filter((x) => ["submitted", "in_review", "awaiting_info", "in_approval"].includes(x.status)).length;
    const brief = await ai.runSyncTask(ctx, { task: "entity.brief", subjectKind: "association", subjectId: id, inputs: { now: `${apps.length} طلبات، ${open} مفتوحة`, waiting: a.status === "pending_review" ? "التسجيل بانتظار مراجعتك" : "لا شيء ينتظر الآن" } });
    return { a, apps, spent: spent.s, evals, activity, aiOn: donor.ai_enabled, brief,
      refs: apps.map((x) => ({ x, ref: resolveRef(ctx.actor, { kind: "application", id: x.id, label: `${x.ref} ${x.title}`, orgId: id }) })) };
  });
  if (!d) notFound();
  async function review(approve: boolean) { "use server"; await asUser((ctx) => orgService.reviewLetter(ctx, id, approve)); revalidatePath(`/staff/associations/${id}`); }
  return (
    <div className="flex flex-col gap-4">
      {d.a.status === "pending_review" && (
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-3 rounded-md bg-warning-bg p-4">
          {d.a.letter_file_id && <a className="text-link underline" href={`/api/files/${d.a.letter_file_id}`}>{t("staff.letterApprove")}</a>}
          <form action={review.bind(null, true)}><SubmitButton>{t("staff.letterApprove")}</SubmitButton></form>
          <form action={review.bind(null, false)}><SubmitButton variant="danger">{t("staff.letterReject")}</SubmitButton></form>
        </div>
      )}
      <AssociationPageView name={d.a.name} reference={`ترخيص ${d.a.license_no}`} status={{ tone: d.a.status === "active" ? "done" : "near", label: d.a.status }}
        brief={aiState(d.brief.id ? { id: d.brief.id, status: d.brief.status, output: d.brief.output as Record<string, unknown> | null, error: null } : null, d.aiOn, (o) => ({ now: String(o.now), waiting: String(o.waiting) }))}
        facts={[{ label: "المدينة", value: d.a.city ?? "—" }, { label: "التسجيل", value: d.a.registered_via === "otp" ? "برمز تحقق" : "بخطاب رسمي" }]}
        applications={d.refs.map(({ x, ref }) => ({ id: x.id, entity: ref, stage: statusLabel(x.status), tone: appTone[x.status] ?? "neutral" }))}
        grants={d.refs.filter(({ x }) => x.approved_halalas).map(({ x, ref }) => ({ id: x.id, entity: ref, amountHalalas: x.approved_halalas ?? 0 }))}
        spentHalalas={Number(d.spent)} rating={d.a.rating}
        evaluations={d.evals.map((e) => ({ id: e.project_id, text: `${e.performance_rating ?? "—"} ${e.performance_note ?? ""}` }))}
        activity={d.activity.map((x) => ({ id: String(x.id), at: x.at, atLabel: fmtDate(x.at), actor: x.actor_label ?? "", text: x.text_key, ai: x.ai }))} />
    </div>
  );
}
