"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Card } from "@wbl/ui";
import type { AiState } from "@wbl/ui/ai";
import { ApplicationFormView, type CheckResult, type FormFieldVM } from "@wbl/ui/views";
import { attachAction, prefillAction, prefillResultAction, previewAction, saveFormAction, submitAction } from "./actions";

export function EditClient({ id, programName, steps, fields, initialValues, aiOn, resubmit, attachments: initialAtt }: { id: string; programName: string; steps: string[]; fields: FormFieldVM[]; initialValues: Record<string, string>; aiOn: boolean; resubmit: boolean; attachments: string[] }) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [prefilled, setPrefilled] = useState<string[]>([]);
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<AiState<Record<string, string>> | null>(null);
  const [atts, setAtts] = useState(initialAtt.length);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshPreview = useCallback(async () => { const r = await previewAction(id); if (r.ok && r.data) setChecks(r.data.checks); }, [id]);
  useEffect(() => { void refreshPreview(); }, [refreshPreview]);

  // R-022 autosave: two seconds after the last keystroke.
  const onChange = (k: string, v: string) => {
    const next = { ...values, [k]: v };
    setValues(next);
    setPrefilled((p) => p.filter((x) => x !== k));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await saveFormAction(id, next);
      if (r.ok) { setSaved(new Date().toLocaleTimeString("ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit" })); void refreshPreview(); } else setErr(r.error);
    }, 2000);
  };

  // N-03: poll the prefill result while Manih works.
  useEffect(() => {
    if (prefill?.status !== "pending") return;
    const t = setInterval(async () => {
      const o = await prefillResultAction(id);
      if (o?.status === "ready") {
        const f = (o.output as { fields: Array<{ key: string; value: string }> }).fields;
        const keys = f.filter((x) => fields.some((y) => y.key === x.key) && !values[x.key]).map((x) => x.key);
        setValues((v) => ({ ...v, ...Object.fromEntries(f.filter((x) => keys.includes(x.key)).map((x) => [x.key, x.value])) }));
        setPrefilled(keys);
        setPrefill({ status: "ready", value: {}, outputId: o.id });
      } else if (o?.status === "failed") setPrefill({ status: "failed", reason: o.error ?? "" });
    }, 2000);
    return () => clearInterval(t);
  }, [prefill, id, fields, values]);

  return (
    <div className="flex flex-col">
      <ApplicationFormView programName={programName} steps={steps} fields={fields} values={values} prefilled={prefilled} checks={checks} savedLabel={saved} submittedRef={submitted}
        prefill={prefill}
        onUsePrepared={aiOn ? async (file) => { const fd = new FormData(); fd.set("file", file); setPrefill({ status: "pending", etaSeconds: 20 }); const r = await prefillAction(id, fd); if (!r.ok) setPrefill({ status: "failed", reason: r.error }); } : undefined}
        onChange={onChange}
        onSubmit={async () => {
          if (timer.current) clearTimeout(timer.current);
          const s = await saveFormAction(id, values);
          if (!s.ok) { setErr(s.error); return; }
          if (resubmit) { router.push(`/portal/applications/${id}`); return; }
          const r = await submitAction(id);
          if (r.ok && r.data) setSubmitted(r.data.ref); else if (!r.ok) setErr(r.error);
        }} />
      <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 md:pb-6">
        <Card className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-caption font-medium">المرفقات ({atts})
            <input type="file" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const fd = new FormData(); fd.set("file", f); const r = await attachAction(id, fd); if (r.ok) setAtts((n) => n + 1); else setErr(r.error); }} />
          </label>
        </Card>
        {err && <div className="mt-3"><Alert tone="danger">{err}</Alert></div>}
      </div>
    </div>
  );
}
