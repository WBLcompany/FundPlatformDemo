"use client";
import { useState } from "react";
import { t } from "../i18n";
import type { Feedback } from "./types";

/** N-11: every AI output accepts helpful / not helpful + reason. */
export function FeedbackControl({ onSubmit }: { onSubmit: (f: Feedback) => void }) {
  const [state, setState] = useState<"idle" | "asking" | "sent">("idle");
  const [reason, setReason] = useState("");
  if (state === "sent") return <span role="status" className="text-caption text-text-muted">{t("ai.feedbackThanks")}</span>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-caption">
      <button type="button" className="rounded-sm px-2 py-1 text-link hover:underline" onClick={() => { onSubmit({ helpful: true }); setState("sent"); }}>{t("ai.helpful")}</button>
      <button type="button" className="rounded-sm px-2 py-1 text-link hover:underline" onClick={() => setState("asking")}>{t("ai.notHelpful")}</button>
      {state === "asking" && (
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); onSubmit({ helpful: false, reason }); setState("sent"); }}>
          <label className="sr-only" htmlFor="ai-fb-reason">{t("ai.feedbackReason")}</label>
          <input id="ai-fb-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("ai.feedbackReason")} className="rounded-sm border border-border px-2 py-1" />
          <button type="submit" className="rounded-sm bg-neutral-100 px-2 py-1 text-text">{t("ai.feedbackSend")}</button>
        </form>
      )}
    </div>
  );
}
