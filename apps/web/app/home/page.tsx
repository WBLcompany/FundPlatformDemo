import { redirect } from "next/navigation";
import { iam } from "@wbl/domain";
import { currentActor } from "@/lib/auth";

/** Routes each person to their entry point (docs/01-requirements.md §4). */
export default async function HomeRouter() {
  const me = await currentActor();
  if (!me) redirect("/login");
  const roles = iam.rolesOf(me.actor);
  // Entry point per role (§4): the manager and the executive start on their home page, finance on
  // the finance page, everyone else on «مهامي».
  if (roles.includes("executive") || roles.includes("grants_manager")) redirect("/staff/home");
  if (roles.includes("finance")) redirect("/staff/finance");
  if (roles.some((r) => (iam.STAFF_ROLES as readonly string[]).includes(r) || r === "external_reviewer")) redirect("/staff");
  if (roles.includes("supplier_rep")) redirect("/supplier");
  redirect("/portal");
}
