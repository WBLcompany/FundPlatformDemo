"use client";
import type { NavItem } from "@wbl/ui";
import { DemoDataNote, PortalShell, StaffShell } from "@wbl/ui/views";
import { DONOR } from "./mock";
import { journeys, screens } from "./screens";

const staffNav = (active: string): NavItem[] => [
  { href: "/s/S1", label: "مهامي", icon: "tasks", active: active === "S1", count: 3 },
  { href: "/s/M1", label: "الطلبات", icon: "applications", active: active.startsWith("M") || active.startsWith("S2") },
  { href: "/s/P1", label: "المشاريع", icon: "projects", active: active.startsWith("P") || active === "A1" },
  { href: "/s/D1", label: "الجمعيات", icon: "associations", active: active.startsWith("D") },
  { href: "/s/C1", label: "اللجنة", icon: "committee", active: active.startsWith("C") },
  { href: "/s/F1", label: "الصرف", icon: "disbursement", active: active.startsWith("F") },
  { href: "/s/E1", label: "التقارير", icon: "reports", active: active.startsWith("E") },
  { href: "/s/G1", label: "الإعدادات", icon: "settings", active: active.startsWith("G") },
];
const portalNav = (active: string): NavItem[] => [
  { href: "/s/J4", label: "لوحتي", icon: "tasks", active: active === "J4" },
  { href: "/s/J7", label: "طلباتي", icon: "applications", active: active === "J7" || active === "J6" },
  { href: "/s/P2", label: "مشاريعي", icon: "projects", active: active === "P2" },
  { href: "/s/J5", label: "الوثائق", icon: "file", active: active === "J5" },
];

export function ScreenFrame({ id }: { id: string }) {
  const s = screens.find((x) => x.id === id)!;
  const inJourney = screens.filter((x) => x.journey === s.journey);
  const idx = inJourney.findIndex((x) => x.id === id);
  const next = inJourney[idx + 1];
  const prev = inJourney[idx - 1];
  const j = journeys.find((x) => x.id === s.journey);
  const bar = (
    <div className="flex flex-wrap items-center gap-3 text-caption print:hidden">
      <a href="/" className="text-link underline">الرحلات</a>
      <span className="text-text-muted">{j?.title}</span>
      <span className="font-mono">{s.id} · {s.title}</span>
      <span className="ms-auto flex gap-3">
        {prev && <a className="text-link underline" href={`/s/${prev.id}`}>السابق: {prev.id}</a>}
        {next && <a className="font-bold text-link underline" href={`/s/${next.id}`}>التالي: {next.id}</a>}
      </span>
    </div>
  );
  if (s.shell === "staff") {
    return <StaffShell nav={staffNav(id)} brand={<span className="text-h3 font-bold text-white">وبل · المنح</span>} user={<span>{s.role}</span>} topBar={bar} footer={<DemoDataNote />}>{s.render()}</StaffShell>;
  }
  if (s.shell === "portal") {
    return <><div className="border-b border-border bg-surface px-4 py-2">{bar}</div><PortalShell donorName={DONOR} nav={portalNav(id)}>{s.render()}<DemoDataNote /></PortalShell></>;
  }
  return <div className="min-h-screen bg-bg"><div className="border-b border-border bg-surface px-4 py-2">{bar}</div>{s.render()}<DemoDataNote /></div>;
}
