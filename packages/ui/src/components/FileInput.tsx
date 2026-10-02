"use client";
import { useId, useState } from "react";
import { cn } from "../cn";
import { t } from "../i18n";

/**
 * File picker with an Arabic button and the chosen file's name. The native input stays in the DOM
 * (visually hidden, still focusable) so forms submit it and keyboards reach it; the browser's own
 * «Choose File» text, which follows the browser's language rather than the page's, never shows.
 */
export function FileInput({ label, name, accept, multiple, required, disabled, onFiles, className }: {
  label: string;
  name?: string;
  accept?: string;
  multiple?: boolean;
  required?: boolean;
  disabled?: boolean;
  onFiles?: (files: File[]) => void;
  className?: string;
}) {
  const id = useId();
  const [chosen, setChosen] = useState<string[]>([]);
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span id={`${id}-label`} className="text-caption font-medium text-text">{label}{required && <span className="text-danger-text"> *</span>}</span>
      <label htmlFor={id} aria-hidden="true" className={cn("group flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-3", disabled && "cursor-not-allowed opacity-60")}>
        <span className="rounded-sm border border-deep-green px-3 py-1 text-body-sm font-bold text-text group-focus-within:outline-2 group-focus-within:outline-focus">{t("file.choose")}</span>
        <span id={`${id}-chosen`} aria-hidden="true" className="min-w-0 truncate text-body-sm text-text-muted">{chosen.length === 0 ? t("file.none") : chosen.join("، ")}</span>
      </label>
      <input
        id={id} type="file" name={name} accept={accept} multiple={multiple} required={required} disabled={disabled}
        className="sr-only"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-chosen`}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          setChosen(files.map((f) => f.name));
          if (files.length) onFiles?.(files);
        }}
      />
    </div>
  );
}
