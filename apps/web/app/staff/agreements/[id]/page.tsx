import { notFound } from "next/navigation";
import { projectService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { AgreementClient } from "./AgreementClient";

export const dynamic = "force-dynamic";

/* A1 · R-048 R-049: the generated agreement; the donor signs after the signatory. */
export default async function Agreement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await asUser(async (ctx) => {
    const ag = await projectService.getAgreement(ctx, id).catch(() => null);
    if (!ag) return null;
    const app = await ctx.tx.one<{ title: string }>("select title from cycle.applications where id = $1", [ag.application_id]);
    const canSign = ctx.actor.grants.some((g) => ["executive", "grants_manager"].includes(g.role));
    return { ag, title: app.title, canSign };
  }, { readOnly: true });
  if (!d) notFound();
  return <AgreementClient id={id} agreementRef={d.ag.ref} title={d.title} issuedAt={d.ag.created_at} previewHref={d.ag.generated_file_id ? `/api/files/${d.ag.generated_file_id}` : null}
    associationSigned={d.ag.association_signed_at} donorSigned={d.ag.donor_signed_at} canDonorSign={d.canSign} />;
}
