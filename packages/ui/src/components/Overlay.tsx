"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "../cn";
import { Icon } from "../icons";
import { t } from "../i18n";

function useEscapeAndFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [open, onClose]);
  return ref;
}

function Shell({ open, onClose, title, children, kind, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; kind: "drawer" | "modal"; footer?: ReactNode }) {
  const titleId = useId();
  const ref = useEscapeAndFocus(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex print:hidden">
      <div className="absolute inset-0 bg-deep-green/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative flex flex-col bg-surface shadow-float outline-none",
          kind === "drawer" ? "ms-auto h-full w-full max-w-lg rounded-s-lg" : "m-auto max-h-[90vh] w-full max-w-xl rounded-lg",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id={titleId} className="text-h2 font-bold text-text">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-sm p-2 text-text hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-focus" aria-label={t("common.close")}>
            <Icon name="close" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/** Slides in from the logical end edge (left in RTL). Escape closes; focus moves in and returns. */
export function Drawer(props: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  return <Shell {...props} kind="drawer" />;
}

export function Modal(props: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  return <Shell {...props} kind="modal" />;
}
