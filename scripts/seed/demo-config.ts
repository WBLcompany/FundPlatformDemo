// Demo framework for «مؤسسة نورة الملاحي (تجريبي)» (docs/05-figma-prototype.md §6).
// DATA, not code: no branch anywhere tests for this donor (invariant 11).
import { framework } from "@wbl/domain";

export function noorahDemoConfig(): framework.FrameworkConfig {
  const base = framework.defaultConfig("مؤسسة نورة الملاحي (تجريبي)");
  const program = framework.defaultProgram({
    id: "family-empowerment-1448",
    name: "تمكين الأسر المنتجة 1448",
    description: "يدعم البرنامج مشاريع الجمعيات التي تمكّن الأسر المنتجة من دخل مستدام عبر التدريب والتجهيز والتسويق.",
    capHalalas: 40_000_000,
    durationMonths: 12,
    window: { opensAt: "2026-10-01T00:00:00Z", closesAt: "2027-03-31T20:59:00Z" },
    criteria: [
      { key: "need", name: "وضوح الاحتياج", weight: 20, max: 5 },
      { key: "goals", name: "ملاءمة الأهداف", weight: 15, max: 5 },
      { key: "method", name: "منهجية التنفيذ", weight: 20, max: 5 },
      { key: "budget", name: "واقعية الموازنة", weight: 20, max: 5 },
      { key: "indicators", name: "مؤشرات قابلة للقياس", weight: 15, max: 5 },
      { key: "capacity", name: "قدرة الجمعية", weight: 10, max: 5 },
    ],
    conditions: [
      "جمعية مسجلة بترخيص ساري من المركز الوطني لتنمية القطاع غير الربحي",
      "وثائق الجمعية سارية: الترخيص وشهادة الحساب البنكي",
      "لا التزامات متأخرة مع المؤسسة",
      "المبلغ المطلوب لا يتجاوز 400,000 ريال",
    ],
    faq: [
      { q: "هل يمكن التقديم بأكثر من مشروع؟", a: "طلب واحد مفتوح لكل جمعية في البرنامج." },
      { q: "متى تصل النتيجة؟", a: "خلال ٣٠ يوم عمل من اكتمال الطلب، ويصلكم الإشعار على البريد الرسمي." },
    ],
    approvalChainId: "noorah-grants",
    waqfCategory: "economic",
    budgetAccount: "grants-1448",
  });
  program.eligibility.rules.push({ id: "overdue", when: [{ field: "association.overdueObligations", op: "gt", value: 0 }], then: { refuse: true }, reason: "على الجمعية التزامات متأخرة مع المؤسسة", label: "لا التزامات متأخرة" });
  program.form.properties.budgetLines = { type: "string", title: "بنود الموازنة (بند: مبلغ في كل سطر)", maxLength: 4000, "x-step": 3, "x-widget": "textarea" };
  program.form.properties.indicators = { type: "string", title: "المؤشرات القابلة للقياس", maxLength: 3000, "x-step": 2, "x-widget": "textarea" };

  const independent = framework.defaultProgram({
    id: "orphan-education-1448",
    name: "تعليم الأيتام 1448",
    description: "منح تعليمية للجمعيات التي ترعى الأيتام، بالدراسة المستقلة.",
    capHalalas: 25_000_000,
    studyMode: "independent",
    window: { opensAt: "2026-10-01T00:00:00Z", closesAt: "2027-03-31T20:59:00Z" },
    approvalChainId: "noorah-grants",
    waqfCategory: "education",
    budgetAccount: "grants-1448",
  });

  return {
    ...base,
    settings: { ...base.settings, assignment: { method: "program_then_load", specialistsByProgram: {} } },
    programs: [program, independent],
    approvalChains: [{
      id: "noorah-grants", name: "مسار اعتماد المنح",
      levels: [
        { key: "manager", label: "مدير المنح", role: "grants_manager", committee: false, activation: [], backupRole: "executive" },
        { key: "committee", label: "اللجنة", role: "committee_secretary", committee: true, activation: [{ field: "amountHalalas", op: "gt", value: 10_000_000 }] },
        { key: "ceo", label: "المدير التنفيذي", role: "executive", committee: false, activation: [{ field: "amountHalalas", op: "gt", value: 30_000_000 }] },
      ],
    }],
    waqfCategories: [{ key: "economic", label: "التمكين الاقتصادي", targetPercent: 40 }, { key: "education", label: "التعليم", targetPercent: 35 }, { key: "care", label: "الرعاية", targetPercent: 25 }],
    budgetAccounts: [{ key: "grants-1448", name: "منح 1448", period: "1448" }],
    catalog: [{ id: "sewing-machine", name: "ماكينة خياطة صناعية", unitHalalas: 450_000, totalQuantity: 200, perAssociationMax: 20, windowDays: 90 }],
  };
}
