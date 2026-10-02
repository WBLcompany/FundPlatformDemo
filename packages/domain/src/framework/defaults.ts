import type { FrameworkConfig, ProgramConfig } from "./schema";

/**
 * R-002: a donor that never opens the settings can still receive and approve an
 * application. Every value here is the documented default (docs/01-requirements.md §8).
 * Nothing in this file names a donor (invariant 11): donor differences are data.
 */
export function defaultProgram(overrides: Partial<ProgramConfig> = {}): ProgramConfig {
  return {
    id: "general",
    name: "منح المشاريع التنموية",
    description: "برنامج مفتوح لمقترحات الجمعيات المستوفية للشروط.",
    type: "open_proposal",
    access: "public",
    capHalalas: 50_000_000,
    durationMonths: 12,
    window: { opensAt: "2026-01-01T00:00:00Z", closesAt: "2027-12-31T20:59:00Z" },
    criteria: [
      { key: "need", name: "وضوح الاحتياج", weight: 25, max: 5 },
      { key: "method", name: "منهجية التنفيذ", weight: 25, max: 5 },
      { key: "budget", name: "واقعية الموازنة", weight: 25, max: 5 },
      { key: "capacity", name: "قدرة الجمعية", weight: 25, max: 5 },
    ],
    form: {
      type: "object",
      required: ["title", "need", "goals", "method", "amount", "beneficiaries"],
      "x-steps": ["المشروع", "الأهداف والمنهجية", "الموازنة والمستفيدون"],
      properties: {
        title: { type: "string", title: "اسم المشروع", maxLength: 200, "x-step": 1, "x-maps-to": "title" },
        need: { type: "string", title: "وصف الاحتياج", maxLength: 4000, "x-step": 1, "x-widget": "textarea" },
        goals: { type: "string", title: "الأهداف", maxLength: 4000, "x-step": 2, "x-widget": "textarea" },
        method: { type: "string", title: "منهجية التنفيذ", maxLength: 6000, "x-step": 2, "x-widget": "textarea" },
        amount: { type: "number", title: "المبلغ المطلوب (ريال)", minimum: 1, "x-step": 3, "x-widget": "money", "x-maps-to": "requested_amount" },
        beneficiaries: { type: "integer", title: "عدد المستفيدين", minimum: 1, "x-step": 3, "x-maps-to": "beneficiaries" },
      },
    },
    eligibility: {
      id: "eligibility", name: "الأهلية", hitPolicy: "COLLECT",
      rules: [
        { id: "readiness", when: [{ field: "association.ready", op: "eq", value: false }], then: { refuse: true }, reason: "الجمعية غير جاهزة للتقديم" },
        { id: "cap", when: [{ field: "application.requestedHalalas", op: "gt", valueFrom: "program.capHalalas" }], then: { refuse: true }, reason: "المبلغ يتجاوز سقف البرنامج" },
        { id: "duplicate", when: [{ field: "association.openApplicationsInProgram", op: "gte", value: 1 }], then: { refuse: true }, reason: "لدى الجمعية طلب مفتوح في هذا البرنامج" },
        { id: "window", when: [{ field: "program.isOpen", op: "eq", value: false }], then: { refuse: true }, reason: "التقديم على البرنامج مغلق" },
      ],
    },
    conditions: ["جمعية مسجلة بترخيص ساري", "وثائق الجمعية الجوهرية سارية", "المبلغ ضمن سقف البرنامج"],
    faq: [],
    approvalChainId: "default",
    budgetAccount: "main",
    ...overrides,
  };
}

export function defaultConfig(displayName = "الجهة المانحة"): FrameworkConfig {
  return {
    identity: { displayName },
    settings: {
      verification: "otp_or_letter",
      readiness: { requiredDocuments: ["license", "bank_certificate"], essentialDocuments: ["license", "bank_certificate"], noOverdueObligations: true, nearExpiryDays: 30 },
      assignment: { method: "program_then_load", specialistsByProgram: {} },
      studyMode: "manih_first",
      showRejectionReason: false,
      performanceVisibility: "internal",
      sla: { submitted: 2, in_review: 10, awaiting_info: 5, in_approval: 5, receiptDays: 10, deliverableReminderDays: 7, signatoryResponseDays: 5 },
      escalation: "notify_only",
      reminderChannel: "whatsapp",
      finalInstallment: { enabled: true, minPercent: 10 },
      naturalLanguageRoles: ["executive", "grants_manager"],
    },
    documentTypes: [
      { key: "license", label: "ترخيص الجمعية", expires: true },
      { key: "bank_certificate", label: "شهادة الحساب البنكي", expires: true },
      { key: "bylaws", label: "النظام الأساسي", expires: false },
      { key: "assembly_minutes", label: "محضر الجمعية العمومية", expires: true },
      { key: "receipt", label: "مستند استلام", expires: false },
    ],
    programs: [defaultProgram()],
    approvalChains: [{ id: "default", name: "مسار الاعتماد الافتراضي", levels: [
      { key: "manager", label: "مدير المنح", role: "grants_manager", committee: false, activation: [] },
      { key: "executive", label: "المدير التنفيذي", role: "executive", committee: false, activation: [] },
    ] }],
    disbursementChain: { id: "disbursement", name: "سلسلة اعتماد الصرف", levels: [{ key: "finance", label: "المالية", role: "finance", committee: false, activation: [] }] },
    catalog: [],
    waqfCategories: [],
    budgetAccounts: [{ key: "main", name: "الميزانية العامة", period: "2026" }],
  };
}
