"use client";
import { useActionState, type ReactNode } from "react";
import { Alert } from "@wbl/ui";

type Result = { ok: boolean; error?: string; message?: string } | null;

/**
 * A plain <form> bound to a server action, with the result announced in place.
 * Works without JavaScript too (progressive enhancement), and every submit is
 * a POST (Server Actions only accept POST).
 */
export function ActionForm({ action, children, className, success }: { action: (prev: Result, fd: FormData) => Promise<Result>; children: ReactNode; className?: string; success?: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className ?? "flex flex-col gap-4"} aria-busy={pending || undefined}>
      {children}
      {state && !state.ok && state.error && <Alert tone="danger">{state.error}</Alert>}
      {state && state.ok && (state.message ?? success) && <Alert tone="success">{state.message ?? success}</Alert>}
    </form>
  );
}

export function SubmitButton({ children, variant = "primary", name, value }: { children: ReactNode; variant?: "primary" | "secondary" | "danger"; name?: string; value?: string }) {
  const cls = variant === "primary" ? "bg-action text-action-text hover:bg-light-green" : variant === "danger" ? "bg-danger-bg text-danger-text" : "border border-deep-green bg-surface text-text";
  return <button type="submit" name={name} value={value} className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 font-bold ${cls} focus-visible:outline-2 focus-visible:outline-focus`}>{children}</button>;
}
