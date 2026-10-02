import type { ReactNode } from "react";
import { PortalHeader, PoweredBy, Sidebar, type NavItem } from "../components/Navigation";
import { t } from "../i18n";
import { cn } from "../cn";

/** Staff portal: Deep Green sidebar + white work surface. */
export function StaffShell({ nav, brand, user, children, footer, topBar }: { nav: NavItem[]; brand: ReactNode; user?: ReactNode; children: ReactNode; footer?: ReactNode; topBar?: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bg">
      <div className="hidden lg:block"><div className="sticky top-0 h-screen"><Sidebar items={nav} brand={brand} footer={user} /></div></div>
      <div className="flex min-w-0 flex-1 flex-col">
        <nav aria-label={t("common.mainNav")} className="flex gap-1 overflow-x-auto bg-chrome px-3 py-2 lg:hidden print:hidden">
          {nav.map((it) => (
            <a key={it.href} href={it.href} aria-current={it.active ? "page" : undefined}
              className={cn("flex min-h-11 shrink-0 items-center rounded-md px-3 text-body-sm text-white/80 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-tech-green", it.active && "bg-white/10 font-bold text-white")}>{it.label}</a>
          ))}
        </nav>
        {topBar && <div className="border-b border-border bg-surface px-6 py-3 print:hidden">{topBar}</div>}
        <main id="main" className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 lg:px-8">{children}</main>
        {footer}
      </div>
    </div>
  );
}

/** Association / supplier portal: donor identity in the header only, «مشغّل بواسطة وبل» in the footer. */
export function PortalShell({ donorName, nav, user, children }: { donorName: string; nav: NavItem[]; user?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <PortalHeader donorName={donorName} items={nav} user={user} />
      <main id="main" className="flex-1">{children}</main>
      <footer className="pb-16 md:pb-0"><PoweredBy /></footer>
    </div>
  );
}

export function DemoDataNote() {
  return <p className="py-2 text-center text-caption text-text-muted">{t("common.demoData")}</p>;
}
