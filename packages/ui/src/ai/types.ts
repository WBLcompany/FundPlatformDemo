/** Evidence is mandatory on every score or flag (docs/02-ai-layer.md §3). page/span are null until Manih returns them. */
export type Evidence = {
  fileId: string;
  fileName: string;
  page: number | null;
  span: { start: number; end: number } | null;
  excerpt: string;
};

/** The five states every AI surface must render (docs/05-figma-prototype.md §7). */
export type AiState<T> =
  | { status: "pending"; etaSeconds?: number }
  | { status: "ready"; value: T; outputId: string; evidence?: Evidence[] }
  | { status: "edited"; value: T; original: T; outputId: string; evidence?: Evidence[] }
  | { status: "failed"; reason: string }
  | { status: "disabled" };

export type Feedback = { helpful: boolean; reason?: string };
