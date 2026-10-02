import { randomUUID, createHash } from "node:crypto";
import { signWebhook, type ManihClient, type TaskRequest, type TaskResult } from "./client";
import type { TaskOutput, TaskType } from "./schemas";

/**
 * R-113 / T-31: a deterministic Manih for tests and demos. Same contract as the
 * real one; results are derived from the inputs so a test can predict them.
 * Async tasks are delivered to callback_url with a real HMAC signature, so the
 * webhook path is exercised end to end. No network beyond the callback.
 */
type Mode = "ok" | "fail" | "invalid";
export class MockManihClient implements ManihClient {
  readonly name = "manih-mock";
  private readonly results = new Map<string, TaskResult>();
  constructor(private readonly opts: { secret: string; mode?: Mode; delayMs?: number; fetchImpl?: typeof fetch; deliver?: boolean } ) {}

  async submit(req: TaskRequest) {
    const task_id = `mock_${createHash("sha256").update(req.idempotency_key).digest("hex").slice(0, 16)}`;
    const result = this.compute(task_id, req);
    this.results.set(task_id, result);
    if (this.opts.deliver !== false) {
      const send = async () => {
        const body = JSON.stringify(result);
        try {
          await (this.opts.fetchImpl ?? fetch)(req.callback_url, { method: "POST", body, headers: { "content-type": "application/json", "x-manih-event": `task.${result.status}`, ...signWebhook(this.opts.secret, body) } });
        } catch { /* the platform falls back to GET /tasks/{id} */ }
      };
      if (this.opts.delayMs) setTimeout(() => void send(), this.opts.delayMs); else await send();
    }
    return { task_id };
  }

  async get(taskId: string) {
    return this.results.get(taskId) ?? { status: "running" as const };
  }

  async runSync<T extends TaskType>(task: T, _tenantRef: string, inputs: Record<string, unknown>): Promise<TaskOutput<T> | null> {
    if (this.opts.mode === "fail") return null;
    return mockOutput(task, inputs) as TaskOutput<T>;
  }

  compute(task_id: string, req: TaskRequest): TaskResult {
    const base = { task_id, idempotency_key: req.idempotency_key, task_type: req.task_type, schema_version: req.schema_version, model: "mock-1", package_version: "mock-2026.10" };
    if (this.opts.mode === "fail") return { ...base, status: "failed", error: "mock failure" };
    if (this.opts.mode === "invalid") return { ...base, status: "completed", output: { nonsense: true } };
    return { ...base, status: "completed", output: mockOutput(req.task_type, req.inputs), cost_usd: 0, latency_ms: 5 };
  }
}

const ev = (fileId: string, excerpt: string, page = 1) => ({ file_id: fileId, page, span: { start: 0, end: Math.min(excerpt.length, 40) }, excerpt });

export function mockOutput(task: TaskType, inputs: Record<string, unknown>): unknown {
  const files = (inputs.attachments as Array<{ id: string; text?: string }> | undefined) ?? [];
  const fileId = files[0]?.id ?? "form";
  const text = String(files[0]?.text ?? JSON.stringify(inputs.form ?? {})).slice(0, 300) || "—";
  switch (task) {
    case "application.study_file": {
      const criteria = (inputs.criteria as Array<{ key: string; name: string; max: number }>) ?? [];
      const requested = Number(inputs.requested_halalas ?? 0);
      const budget = (inputs.budget as Array<{ item: string; amount_halalas: number }>) ?? [];
      const biggest = [...budget].sort((a, b) => b.amount_halalas - a.amount_halalas)[0];
      const modified = Math.round((requested * 0.9) / 100_000) * 100_000;
      return {
        summary: { text: `ملخص مانح: ${String(inputs.title ?? "الطلب")} — المطلوب ${requested / 100} ريال.`, evidence: [ev(fileId, text)] },
        scores: criteria.map((c, i) => ({ criterion: c.key, score: Math.max(1, c.max - (i % 3)), rationale: `تقييم مبدئي لمعيار «${c.name}» من نص الطلب.`, evidence: [ev(fileId, text, i + 1)] })),
        budget_flags: biggest ? [{ item: biggest.item, amount_halalas: biggest.amount_halalas, reason: "أعلى بند في الموازنة؛ راجع السعر بعرض معتمد", evidence: [ev(fileId, text)] }] : [],
        suggested_track: null,
        schedule: [
          { label: "الدفعة الأولى", percent: 40, condition: "signature", deliverable: "خطة التنفيذ التفصيلية", due_offset_days: 14 },
          { label: "الدفعة الثانية", percent: 40, condition: "deliverable", deliverable: "تقرير الإنجاز المرحلي", due_offset_days: 120 },
          { label: "الدفعة الختامية", percent: 20, condition: "final_report", deliverable: "التقرير الختامي", due_offset_days: 330 },
        ],
        recommendation: { decision: "approve_modified", amount_halalas: modified, rationale: "يوصى بالموافقة بمبلغ معدل بعد مراجعة أعلى بنود الموازنة." },
      };
    }
    case "document.extract": {
      const name = String(inputs.file_name ?? "");
      const type = /بنك|bank/i.test(name) ? "bank_certificate" : /محضر|minutes/i.test(name) ? "assembly_minutes" : "license";
      return { type, number: "1287", issue_date: "2024-03-01", expiry_date: "2027-03-01", confidence: 0.92 };
    }
    case "proposal.prefill": {
      const keys = (inputs.form_keys as string[]) ?? [];
      return { fields: keys.slice(0, 3).map((k) => ({ key: k, value: `قيمة مستخرجة لحقل ${k}`, evidence: ev(fileId, text) })) };
    }
    case "message.draft":
      return { text: `السلام عليكم ورحمة الله،\n${String(inputs.purpose === "info_request" ? "نرجو تزويدنا بما يلي لاستكمال دراسة الطلب:" : "نفيدكم بما يلي:")}\n${((inputs.items as string[]) ?? []).map((x, i) => `${i + 1}. ${x}`).join("\n")}` };
    case "committee.extract": {
      const refs = (inputs.application_refs as string[]) ?? [];
      return { decisions: refs.map((r, i) => ({ application_ref: r, decision: i % 4 === 3 ? "reject" : "approve", amount_halalas: null, evidence: ev(fileId, `البند ${i + 1}: ${r}`, 1 + i) })) };
    }
    case "deliverable.review":
      return { matches: [{ requirement: String(inputs.requirement ?? "بند الاتفاقية"), met: true, note: "الملفات المرفقة تغطي البند", evidence: ev(fileId, text) }], gaps: [] };
    case "amendment.diff":
      return { changes: (inputs.literal as string[]) ?? [], impact: "أثر محدود على الجدول والموازنة.", policy_violations: [] };
    case "final_report.review":
      return { planned_vs_achieved: [{ item: "المستفيدون", planned: String(inputs.planned_beneficiaries ?? "—"), achieved: String(inputs.beneficiaries ?? "—"), met: Number(inputs.beneficiaries ?? 0) >= Number(inputs.planned_beneficiaries ?? 0) }], budget_vs_spent: { budget_halalas: Number(inputs.budget_halalas ?? 0), spent_halalas: Number(inputs.spent_halalas ?? 0), note: "المصروف ضمن الموازنة" }, notes: [] };
    case "performance.propose":
      return { rating: "ب", rationale: "التزام بالمواعيد مع ملاحظة واحدة على التوثيق." };
    case "entity.brief":
      return { now: String(inputs.now ?? "الحالة الآن مستقرة."), waiting: String(inputs.waiting ?? "لا شيء ينتظر."), risk: inputs.risk ? String(inputs.risk) : null };
    case "query.interpret": {
      const q = String(inputs.question ?? "");
      if (/صرف|صرفنا|المصروف/.test(q)) return { understood: true, metric: "disbursed_total", filters: /تمكين/.test(q) ? { waqf_category: "التمكين الاقتصادي" } : {}, period: /هذا العام|السنة/.test(q) ? "this_year" : null, explanation: "مجموع الدفعات المنفذة" };
      if (/طلب|طلبات/.test(q) && /كم/.test(q)) return { understood: true, metric: "applications_count", filters: /معتمد/.test(q) ? { status: "approved" } : {}, period: null, explanation: "عدد الطلبات" };
      if (/معتمد|اعتمدنا/.test(q)) return { understood: true, metric: "approved_total", filters: {}, period: /هذا العام/.test(q) ? "this_year" : null, explanation: "مجموع المبالغ المعتمدة" };
      return { understood: false };
    }
    case "policy.draft":
      return { clauses: [{ text: "تدعم المؤسسة الجمعيات المرخصة في مجالاتها المعتمدة.", source: String(files[0]?.id ?? "") || null }, { text: "يُشترط ألا يكون على الجمعية التزامات متأخرة.", source: null }] };
    case "policy.derive_config":
      return { config: {} };
    case "invitation.fit":
      return { fits: ((inputs.candidates as Array<{ id: string }>) ?? []).map((c) => ({ association_id: c.id, fit: "medium", reason: "مجال الجمعية قريب من البرنامج" })) };
  }
}

export const newIdempotencyKey = () => randomUUID();
