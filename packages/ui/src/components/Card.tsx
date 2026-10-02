import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

/** Cards have a border, never a shadow (§4). */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-md border border-border bg-surface p-4", className)} {...rest}>{children}</section>;
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-h3 font-bold text-text">{children}</h3>
      {action}
    </div>
  );
}

export function PageHeader({ title, eyebrow, description, actions }: { title: string; eyebrow?: ReactNode; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        {eyebrow}
        <h1 className="text-h1 font-bold text-text">{title}</h1>
        {description && <p className="max-w-[72ch] text-body text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, href }: { label: string; value: ReactNode; href?: string }) {
  const inner = (
    <>
      <span className="text-caption text-text-muted">{label}</span>
      {/* Long figures (budgets in the millions) step down a size instead of overflowing a narrow tile. */}
      <span className={cn("min-w-0 font-mono font-regular text-text [overflow-wrap:anywhere]", typeof value === "string" && value.length > 9 ? "text-h3" : typeof value === "string" && value.length > 7 ? "text-h2" : "text-h1")}>{value}</span>
    </>
  );
  return href ? (
    <a href={href} className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-surface p-4 hover:border-dark-green focus-visible:outline-2 focus-visible:outline-focus">{inner}</a>
  ) : (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-surface p-4">{inner}</div>
  );
}
