import type { ReactNode } from "react";
import { cn } from "../cn";
import { Icon, type IconName } from "../icons";
import { t } from "../i18n";

export type NavItem = { href: string; label: string; icon: IconName; active?: boolean; count?: number };

/** Staff sidebar: Deep Green, white text at 80%, active item marked by a vertical Tech Green bar (§6). */
export function Sidebar({ items, brand, footer }: { items: NavItem[]; brand: ReactNode; footer?: ReactNode }) {
  return (
    <nav aria-label={t("common.mainNav")} className="flex h-full w-64 shrink-0 flex-col bg-chrome text-white/80 print:hidden">
      <div className="px-6 py-6">{brand}</div>
      <ul className="flex flex-1 flex-col gap-1 px-3">
        {items.map((it) => (
          <li key={it.href}>
            <a
              href={it.href}
              aria-current={it.active ? "page" : undefined}
              className={cn(
                "relative flex min-h-11 items-center gap-3 rounded-md px-3 text-body hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-tech-green",
                it.active && "bg-white/10 font-bold text-white",
              )}
            >
              {it.active && <span aria-hidden="true" className="absolute inset-y-2 start-0 w-1 rounded-sm bg-tech-green" />}
              <Icon name={it.icon} />
              <span className="flex-1">{it.label}</span>
              {typeof it.count === "number" && <span className="font-mono text-caption">{it.count}</span>}
            </a>
          </li>
        ))}
      </ul>
      {footer && <div className="px-6 py-4 text-caption">{footer}</div>}
    </nav>
  );
}

/** Association/supplier portal header: white, donor logo, horizontal nav; a bottom bar on mobile (§6, N-10). */
export function PortalHeader({ donorName, items, user }: { donorName: string; items: NavItem[]; user?: ReactNode }) {
  return (
    <>
      <header className="border-b border-border bg-surface print:hidden">
        <div className="mx-auto flex max-w-[1280px] items-center gap-6 px-4 py-3">
          <span className="text-h3 font-bold text-text">{donorName}</span>
          <nav aria-label={t("common.mainNav")} className="hidden flex-1 md:block">
            <ul className="flex gap-1">
              {items.map((it) => (
                <li key={it.href}>
                  <a href={it.href} aria-current={it.active ? "page" : undefined}
                    className={cn("flex min-h-11 items-center gap-2 rounded-md px-3 text-body hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-focus", it.active ? "font-bold text-text" : "text-text-muted")}>
                    <Icon name={it.icon} size={18} />{it.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ms-auto">{user}</div>
        </div>
      </header>
      <nav aria-label={t("common.mainNav")} className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface md:hidden print:hidden">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((it) => (
            <li key={it.href}>
              <a href={it.href} aria-current={it.active ? "page" : undefined}
                className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-caption", it.active ? "font-bold text-text" : "text-text-muted")}>
                <Icon name={it.icon} />{it.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

export function PoweredBy() {
  return <p className="py-6 text-center text-caption text-text-muted">{t("common.poweredBy")}</p>;
}
