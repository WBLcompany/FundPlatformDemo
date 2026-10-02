import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

export type ButtonVariant = "primary" | "secondary" | "text" | "danger";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-body font-bold transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed";

// Tech Green carries Deep Green text, never white (docs/04-design-system.md §2.4).
const variants: Record<ButtonVariant, string> = {
  primary: "bg-action text-action-text hover:bg-light-green disabled:bg-neutral-100 disabled:text-text-muted",
  secondary: "border border-deep-green bg-surface text-text hover:bg-neutral-50 disabled:border-neutral-200 disabled:text-text-muted",
  text: "min-h-0 px-0 text-link underline-offset-4 hover:underline disabled:text-text-muted",
  danger: "bg-danger-bg text-danger-text hover:bg-choral disabled:bg-neutral-100 disabled:text-text-muted",
};

export function Button({
  variant = "secondary",
  busy = false,
  icon,
  className,
  children,
  type = "button",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; busy?: boolean; icon?: ReactNode }) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
