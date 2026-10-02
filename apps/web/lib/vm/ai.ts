import type { AiState, Evidence } from "@wbl/ui/ai";

type Out = { id: string; status: string; output: Record<string, unknown> | null; error: string | null } | null;
type RawEvidence = { file_id: string; page: number | null; span: { start: number; end: number } | null; excerpt: string };

export function evidenceOf(raw: RawEvidence[] | undefined, files: Map<string, string>): Evidence[] {
  return (raw ?? []).map((e) => ({ fileId: e.file_id, fileName: files.get(e.file_id) ?? "المرفق", page: e.page, span: e.span, excerpt: e.excerpt }));
}

/** Maps a stored AI output to the five UI states (docs/05-figma-prototype.md §7). */
export function aiState<T>(out: Out, aiEnabled: boolean, pick: (o: Record<string, unknown>) => T | undefined, evidence?: Evidence[]): AiState<T> {
  if (!aiEnabled) return { status: "disabled" };
  if (!out) return { status: "failed", reason: "لم يُطلب من مانح بعد" };
  if (out.status === "pending") return { status: "pending", etaSeconds: 90 };
  if (out.status === "failed") return { status: "failed", reason: out.error ?? "تعذّر" };
  if (out.status === "disabled") return { status: "disabled" };
  const v = out.output ? pick(out.output) : undefined;
  if (v === undefined) return { status: "failed", reason: "لا قيمة في المخرج" };
  return { status: "ready", value: v, outputId: out.id, evidence };
}
