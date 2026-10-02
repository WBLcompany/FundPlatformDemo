import { headers } from "next/headers";
import type { NavItem } from "@wbl/ui";
import { StaffShell } from "@wbl/ui/views";
import { t } from "@/lib/i18n";
import { CommandBar } from "./CommandBar";

export async function StaffChrome({ roles, name, donor, aiEnabled, children }: { roles: string[]; name: string; donor: string; aiEnabled: boolean; children: React.ReactNode }) {
  const path = (await headers()).get("x-pathname") ?? "";
  const has = (...r: string[]) => r.some((x) => roles.includes(x));
  const items: Array<NavItem & { show: boolean }> = [
    { href: "/staff", label: t("nav.tasks"), icon: "tasks", show: true },
    { href: "/staff/home", label: t("nav.home"), icon: "reports", show: has("grants_manager", "executive") },
    { href: "/staff/applications", label: t("nav.applications"), icon: "applications", show: has("grants_specialist", "grants_manager", "committee_secretary", "executive", "system_admin") },
    { href: "/staff/projects", label: t("nav.projects"), icon: "projects", show: has("grants_specialist", "grants_manager", "executive", "finance") },
    { href: "/staff/associations", label: t("nav.associations"), icon: "associations", show: has("grants_specialist", "grants_manager", "executive", "system_admin") },
    { href: "/staff/committee", label: t("nav.committee"), icon: "committee", show: has("committee_secretary", "grants_manager") },
    { href: "/staff/finance", label: t("nav.finance"), icon: "disbursement", show: has("finance", "grants_manager", "executive") },
    { href: "/staff/reports", label: t("nav.reports"), icon: "reports", show: has("executive", "grants_manager", "finance", "system_admin") },
    { href: "/staff/settings", label: t("nav.settings"), icon: "settings", show: has("system_admin", "executive") },
  ];
  const nav = items.filter((i) => i.show).map(({ show: _s, ...i }) => ({ ...i, active: i.href === "/staff" ? path === "/staff" : path.startsWith(i.href) }));
  return (
    <StaffShell
      nav={nav}
      brand={<div className="flex flex-col"><span className="text-h3 font-bold text-white">{donor}</span><span className="text-caption text-white/70">{t("app.name")}</span></div>}
      user={<div className="flex flex-col gap-2"><span className="text-white">{name}</span><form action="/logout" method="post"><button className="text-caption text-white/80 underline">{t("app.logout")}</button></form></div>}
      topBar={<div className="flex items-center gap-4"><CommandBar labels={{ open: t("command.open"), dialog: t("command.dialog"), placeholder: t("command.placeholder"), openList: t("command.openList"), notUnderstood: t("command.notUnderstood"), riyal: t("command.riyal") }} />{!aiEnabled && <span className="text-caption text-text-muted">{t("staff.aiOff")}</span>}<a href="/staff/notifications" className="ms-auto text-body-sm text-link underline-offset-4 hover:underline">{t("app.notifications")}</a></div>}
      footer={<p className="py-4 text-center text-caption text-text-muted">{t("app.poweredBy")}</p>}
    >
      {children}
    </StaffShell>
  );
}
