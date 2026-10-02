import { redirect } from "next/navigation";
import { iam } from "@wbl/domain";
import { StaffChrome } from "@/components/StaffChrome";
import { currentActor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const me = await currentActor();
  if (!me) redirect("/login");
  const roles = iam.rolesOf(me.actor);
  if (!roles.some((r) => (iam.STAFF_ROLES as readonly string[]).includes(r) || r === "external_reviewer")) redirect("/portal");
  return <StaffChrome roles={roles} name={me.name} donor={me.donor.name} aiEnabled={me.donor.ai_enabled}>{children}</StaffChrome>;
}
