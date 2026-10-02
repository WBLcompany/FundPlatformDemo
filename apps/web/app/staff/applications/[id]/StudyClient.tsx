"use client";
import { useRouter } from "next/navigation";
import { StudyFileView, type StudyFileVM } from "@wbl/ui/views";
import type { AiState } from "@wbl/ui/ai";
import { feedbackAction, recordAndRevealAction, saveScoreAction } from "./actions";

export function StudyClient({ id, file, brief, canStudy, requestInfoHref, recommendHref, manual }: { manual: { summary: string; recommendation: string }; id: string; file: StudyFileVM; brief?: AiState<{ now: string; waiting: string; risk?: string }>; canStudy: boolean; requestInfoHref?: string; recommendHref?: string }) {
  const router = useRouter();
  return (
    <StudyFileView file={file} brief={brief} actions={{
      onHumanScore: canStudy ? (c, s) => { void saveScoreAction(id, c, s); } : undefined,
      onRecordAndReveal: canStudy ? async () => { await recordAndRevealAction(id); router.refresh(); } : undefined,
      onFeedback: (outputId, f) => { void feedbackAction(outputId, f.helpful, f.reason); },
      requestInfoHref, submitRecommendationHref: recommendHref,
      manualSummary: <a href="#judgement" className="text-body-sm text-link underline-offset-4 hover:underline">{manual.summary}</a>,
      manualRecommendation: recommendHref ? <a href={recommendHref} className="text-body-sm text-link underline-offset-4 hover:underline">{manual.recommendation}</a> : <span className="text-body-sm text-text-muted">—</span>,
    }} />
  );
}
