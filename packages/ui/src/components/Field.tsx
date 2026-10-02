import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../cn";
import { t } from "../i18n";

const control =
  "w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-text placeholder:text-text-muted " +
  "focus:outline-2 focus:outline-offset-0 focus:outline-focus aria-[invalid=true]:border-ink-choral";

type FieldShellProps = { label: string; hint?: string; error?: string; required?: boolean; children: (ids: { id: string; describedBy?: string }) => ReactNode };

export function FieldShell({ label, hint, error, required, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-caption font-medium text-text">
        {label}
        {required && <span className="ms-1 text-ink-choral" aria-label={t("common.required")}>*</span>}
      </label>
      {children({ id, describedBy })}
      {hint && <p id={hintId} className="text-caption text-text-muted">{hint}</p>}
      {error && <p id={errId} role="alert" className="text-caption text-danger-text">{error}</p>}
    </div>
  );
}

type Common = { label: string; hint?: string; error?: string };

export function TextField({ label, hint, error, required, className, ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      {({ id, describedBy }) => (
        <input id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined} required={required} className={cn(control, className)} {...rest} />
      )}
    </FieldShell>
  );
}

export function TextArea({ label, hint, error, required, className, ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      {({ id, describedBy }) => (
        <textarea id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined} required={required} className={cn(control, "min-h-28", className)} {...rest} />
      )}
    </FieldShell>
  );
}

export function SelectField({ label, hint, error, required, className, options, ...rest }: Common & SelectHTMLAttributes<HTMLSelectElement> & { options: Array<{ value: string; label: string }> }) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      {({ id, describedBy }) => (
        <select id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined} required={required} className={cn(control, className)} {...rest}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </FieldShell>
  );
}
