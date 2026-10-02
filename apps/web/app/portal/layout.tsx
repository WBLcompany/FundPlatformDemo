import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { iam } from "@wbl/domain";
import { PortalShell } from "@wbl/ui/views";
import { currentActor } from "@/lib/auth";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/* The association portal: the donor's identity in the header, responsive to 360px (N-10). */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const me = await currentActor();
  if (!me) redirect("/login");
  if (!iam.isAssociation(me.actor)) redirect("/home");
  const path = (await headers()).get("x-pathname") ?? "";
  const nav = [
    { href: "/portal", label: t("nav.portalHome"), icon: "tasks" as const, active: path === "/portal" },
    { href: "/portal/applications", label: t("nav.myApplications"), icon: "applications" as const, active: path.startsWith("/portal/applications") },
    { href: "/portal/projects", label: t("nav.myProjects"), icon: "projects" as const, active: path.startsWith("/portal/projects") || path.startsWith("/portal/deliverables") },
    { href: "/portal/documents", label: t("nav.documents"), icon: "file" as const, active: path.startsWith("/portal/documents") },
    { href: "/portal/account", label: t("nav.account"), icon: "user" as const, active: path.startsWith("/portal/account") },
  ];
  return <PortalShell donorName={me.donor.name} nav={nav} user={<form action="/logout" method="post"><button className="text-body-sm text-link underline">{t("app.logout")}</button></form>}>{children}</PortalShell>;
}
