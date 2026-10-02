// View models: what each screen needs, independent of where it came from.
// The prototype fills them from mock data; apps/web fills them from the
// database. One component, two data sources — "لا رسم مرتين" (D-13).
import type { AiState, Brief, Evidence, ScoreRow } from "../ai";
import type { StatusTone } from "../components/Badge";
import type { EntityRefData } from "../entity/EntityRef";

export type Money = number; // halalas (bigint in DB, number here — safe up to 9e15)
export type Href = string | null;

export type ProgramVM = {
  id: string;
  name: string;
  donorName: string;
  description: string;
  capHalalas: Money;
  opensAt: string;
  closesAt: string;
  durationMonths: number;
  conditions: string[];
  criteria: Array<{ name: string; weight: number; description?: string }>;
  faq: Array<{ q: string; a: string }>;
  frameworkVersion: string;
  applyHref: Href;
  isOpen: boolean;
};

export type ReadinessItem = { key: string; label: string; ok: boolean; reason?: string; actionHref?: Href; actionLabel?: string };
export type DocumentVM = { id: string; type: string; number?: string; expiresAt: string | null; state: "valid" | "near" | "expired" | "pending"; fileName: string };

export type ApplicationRow = {
  id: string;
  ref: string;
  title: string;
  association: EntityRefData;
  program: string;
  stage: string;
  stageTone: StatusTone;
  requestedHalalas: Money;
  dueAt?: string;
  dueTone?: StatusTone;
  href: Href;
};

export type TaskVM = {
  id: string;
  kind: string;
  title: string;
  entity: EntityRefData;
  whatYouNeedToDo: AiState<string> | { status: "plain"; value: string };
  dueLabel: string;
  dueTone: StatusTone;
  href: Href;
};

export type CheckResult = { key: string; label: string; passed: boolean; detail: string; rule?: string };

export type BudgetLineVM = { id: string; item: string; amountHalalas: Money; flag?: { reason: string; evidence?: Evidence[] } };
export type ScheduleRowVM = { id: string; label: string; dueLabel: string; amountHalalas: Money; deliverable: string };

export type StudyFileVM = {
  application: ApplicationRow;
  frameworkVersion: string;
  mode: "manih_first" | "independent";
  revealed: boolean;
  aiEnabled: boolean;
  checks: CheckResult[];
  summary: AiState<string>;
  scores: ScoreRow[];
  maxScore: number;
  budget: AiState<BudgetLineVM[]>;
  schedule: AiState<ScheduleRowVM[]>;
  recommendation: AiState<{ decision: "approve" | "reject" | "approve_modified"; amountHalalas: Money; rationale: string }>;
  history: Array<{ ref: string; title: string; outcome: string; amountHalalas: Money }>;
  attachments: Array<{ id: string; name: string; href: Href }>;
  judgement: { decision: string | null; amountHalalas: Money | null; byName: string | null };
};

export type ActivityVM = { id: string; at: string; atLabel: string; actor: string; text: string; ai?: boolean };
export type BriefState = AiState<Brief>;
