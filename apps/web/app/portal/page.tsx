import { revalidatePath } from "next/cache";
import { Card, CardTitle } from "@wbl/ui";
import { AssociationHomeView } from "@wbl/ui/views";
import { projectService } from "@wbl/services";
import { SubmitButton } from "@/components/ActionForm";
import { asUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { portalHome } from "@/lib/vm/portal";

/* J4 · R-015 R-016: readiness with exactly what is missing, the open programmes, my applications. */
export default async function PortalHome() {
  const d = await asUser((ctx) => portalHome(ctx));
  async function respond(id: string, accept: boolean) { "use server"; await asUser((ctx) => projectService.signatoryRespond(ctx, id, accept)); revalidatePath("/portal"); }
  async function invite(id: string, accept: boolean) { "use server"; await asUser((ctx) => ctx.tx.query("update cycle.invitations set status = $2, responded_at = now() where id = $1", [id, accept ? "accepted" : "declined"])); revalidatePath("/portal"); }
  return (
    <>
      {(d.amendments.length > 0 || d.invitations.length > 0) && (
        <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 pt-6">
          {d.amendments.map((a) => (
            <Card key={a.id}><CardTitle>{t("portal.amendmentRespond")}</CardTitle><p className="mb-3 text-body-sm">{a.justification}</p>
              <div className="flex gap-2"><form action={respond.bind(null, a.id, true)}><SubmitButton>{t("portal.acceptAmendment")}</SubmitButton></form><form action={respond.bind(null, a.id, false)}><SubmitButton variant="danger">{t("portal.declineAmendment")}</SubmitButton></form></div></Card>
          ))}
          {d.invitations.map((i) => (
            <Card key={i.id}><CardTitle>{t("portal.invitations")}</CardTitle><p className="mb-3 text-body-sm">{d.cfg.programs.find((p) => p.id === i.program_id)?.name}</p>
              <div className="flex gap-2"><form action={invite.bind(null, i.id, true)}><SubmitButton>{t("portal.acceptInvite")}</SubmitButton></form><form action={invite.bind(null, i.id, false)}><SubmitButton variant="secondary">{t("portal.declineInvite")}</SubmitButton></form></div></Card>
          ))}
        </div>
      )}
      <AssociationHomeView associationName={d.name} readiness={d.readiness} programs={d.programs} applications={d.applications} documents={d.documents} uploadHref="/portal/documents" />
    </>
  );
}
