import { notFound } from "next/navigation";
import { projectService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { SignClient } from "./SignClient";

export const dynamic = "force-dynamic";

/* A1 (association side) · R-049: the signatory uploads the signed copy. */
export default async function Sign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await asUser(async (ctx) => {
    const ag = await projectService.getAgreement(ctx, id).catch(() => null);
    if (!ag) return null;
    const app = await ctx.tx.one<{ title: string }>("select title from cycle.applications where id = $1", [ag.application_id]);
    return { ag, title: app.title, owner: ctx.actor.grants.some((g) => g.role === "assoc_owner") };
  }, { readOnly: true });
  if (!d) notFound();
  return <SignClient id={id} agreementRef={d.ag.ref} title={d.title} issuedAt={d.ag.created_at} previewHref={d.ag.generated_file_id ? `/api/files/${d.ag.generated_file_id}` : null} associationSigned={d.ag.association_signed_at} donorSigned={d.ag.donor_signed_at} canSign={d.owner} />;
}
