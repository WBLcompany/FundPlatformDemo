// Consistent demo data across every screen (docs/05-figma-prototype.md §6).
// Every name and number here is fictional and the shell footer says so.
import type { ApplicationRow, ProgramVM, StudyFileVM, TaskVM } from "@wbl/ui/views";
import type { Evidence, ScoreRow } from "@wbl/ui/ai";

export const DONOR = "مؤسسة نورة الملاحي (تجريبي)";
export const VERSION = "2026-01";
const SAR = (riyals: number) => riyals * 100;

export const program: ProgramVM = {
  id: "p1",
  name: "تمكين الأسر المنتجة 1448",
  donorName: DONOR,
  description: "يدعم البرنامج مشاريع الجمعيات التي تمكّن الأسر المنتجة من دخل مستدام عبر التدريب والتجهيز والتسويق.",
  capHalalas: SAR(400_000),
  opensAt: "2026-10-04T06:00:00Z",
  closesAt: "2026-11-15T20:59:00Z",
  durationMonths: 12,
  conditions: [
    "جمعية مسجلة بترخيص ساري من المركز الوطني لتنمية القطاع غير الربحي",
    "وثائق الجمعية سارية: الترخيص وشهادة الحساب البنكي",
    "لا التزامات متأخرة مع المؤسسة",
    "المبلغ المطلوب لا يتجاوز 400,000 ريال",
  ],
  criteria: [
    { name: "وضوح الاحتياج", weight: 20 },
    { name: "ملاءمة الأهداف", weight: 15 },
    { name: "منهجية التنفيذ", weight: 20 },
    { name: "واقعية الموازنة", weight: 20 },
    { name: "مؤشرات قابلة للقياس", weight: 15 },
    { name: "قدرة الجمعية", weight: 10 },
  ],
  faq: [
    { q: "هل يمكن التقديم بأكثر من مشروع؟", a: "طلب واحد مفتوح لكل جمعية في الدورة الواحدة." },
    { q: "متى تصل النتيجة؟", a: "خلال ٣٠ يوم عمل من اكتمال الطلب، ويصلك الإشعار على بريدك الرسمي." },
  ],
  frameworkVersion: VERSION,
  applyHref: "/s/J2",
  isOpen: true,
};

export const associations = {
  albir: { kind: "association", id: "a1", label: "جمعية البر بالدار البيضاء", href: "/s/D1" },
  aytam: { kind: "association", id: "a2", label: "جمعية رعاية الأيتام بالخرج", href: "/s/D1" },
  namaa: { kind: "association", id: "a3", label: "جمعية نماء للتنمية", href: "/s/D1" },
} as const;

export const people = {
  sara: { kind: "person", id: "u1", label: "سارة العتيبي", href: null },
  khalid: { kind: "person", id: "u2", label: "خالد الشهري", href: null },
  manager: { kind: "person", id: "u3", label: "منيرة القحطاني", href: null },
  secretary: { kind: "person", id: "u4", label: "فهد الدوسري", href: null },
  finance: { kind: "person", id: "u5", label: "ريم الحربي", href: null },
  ceo: { kind: "person", id: "u6", label: "عبدالله الملاحي", href: null },
};

export const mainApp: ApplicationRow = {
  id: "app417", ref: "ط-2026-0417", title: "مطبخ إنتاجي لتمكين ٤٠ أسرة", association: associations.albir,
  program: program.name, stage: "قيد الدراسة", stageTone: "active", requestedHalalas: SAR(386_000), dueAt: "بعد ٣ أيام", dueTone: "near", href: "/s/S2",
};
export const otherApps: ApplicationRow[] = [
  mainApp,
  { id: "app422", ref: "ط-2026-0422", title: "برنامج تدريب الخياطة المنزلية", association: associations.namaa, program: program.name, stage: "بانتظار الاستكمال", stageTone: "near", requestedHalalas: SAR(210_000), dueAt: "اليوم", dueTone: "late", href: "/s/S2" },
  { id: "app431", ref: "ط-2026-0431", title: "سوق موسمي للأسر المنتجة", association: associations.aytam, program: program.name, stage: "في الاعتماد", stageTone: "active", requestedHalalas: SAR(150_000), dueAt: "بعد ٥ أيام", dueTone: "active", href: "/s/D2" },
];

const ev = (page: number, excerpt: string, start: number, end: number): Evidence => ({ fileId: "f-study", fileName: "دراسة المشروع.pdf", page, span: { start, end }, excerpt });

export const scores: ScoreRow[] = [
  { criterion: "وضوح الاحتياج", weight: 20, max: 5, human: null, manih: { score: 4, rationale: "الاحتياج موثق بمسح ميداني لـ ٦٢ أسرة في الحي.", evidence: [ev(3, "أجرت الجمعية مسحاً ميدانياً شمل 62 أسرة، أظهر أن 71% منها بلا دخل ثابت.", 13, 34)] } },
  { criterion: "ملاءمة الأهداف", weight: 15, max: 5, human: null, manih: { score: 4, rationale: "الأهداف متسقة مع مجال التمكين الاقتصادي.", evidence: [ev(5, "الهدف العام: تمكين 40 أسرة من دخل شهري لا يقل عن 3,000 ريال.", 13, 30)] } },
  { criterion: "منهجية التنفيذ", weight: 20, max: 5, human: null, manih: { score: 3, rationale: "الخطة واضحة لكن مرحلة التسويق تفتقد شريكاً محدداً.", evidence: [ev(8, "سيتم التسويق عبر قنوات متعددة يُحدد لاحقاً الشريك المناسب لها.", 0, 30)] } },
  { criterion: "واقعية الموازنة", weight: 20, max: 5, human: null, manih: { score: 3, rationale: "بند المعدات أعلى من أسعار السوق بنحو ٢٠٪.", evidence: [ev(11, "معدات المطبخ الصناعي: 168,000 ريال", 0, 22)] } },
  { criterion: "مؤشرات قابلة للقياس", weight: 15, max: 5, human: null, manih: { score: 4, rationale: "مؤشرات رقمية للدخل والاستمرار بعد ستة أشهر.", evidence: [ev(9, "نسبة الأسر المستمرة في الإنتاج بعد 6 أشهر: 80%", 0, 33)] } },
  { criterion: "قدرة الجمعية", weight: 10, max: 5, human: null, manih: { score: 5, rationale: "نفذت الجمعية مشروعين مماثلين بنجاح.", evidence: [ev(2, "نفذت الجمعية مشروع المطبخ المركزي 2024 بتمويل 220,000 ريال.", 0, 40)] } },
];

export const studyFile: StudyFileVM = {
  application: mainApp,
  frameworkVersion: VERSION,
  mode: "manih_first",
  revealed: true,
  aiEnabled: true,
  checks: [
    { key: "complete", label: "الاكتمال", passed: true, detail: "كل الحقول المطلوبة والمرفقات موجودة" },
    { key: "eligible", label: "الأهلية", passed: true, detail: "الترخيص ساري حتى ٢٠٢٧/٠٣" },
    { key: "cap", label: "السقف", passed: true, detail: "386,000 ضمن سقف البرنامج 400,000" },
    { key: "duplicate", label: "التكرار", passed: true, detail: "لا طلب مفتوح آخر للجمعية في هذه الدورة" },
  ],
  summary: { status: "ready", outputId: "o-sum", value: "تطلب الجمعية 386,000 ريال لتجهيز مطبخ إنتاجي يدرّب ويشغّل ٤٠ أسرة خلال ١٢ شهراً. الاحتياج موثق بمسح ميداني، والجمعية نفذت مشروعين مماثلين. أبرز الملاحظات: بند المعدات أعلى من السوق، وشريك التسويق غير محدد.", evidence: [ev(1, "ملخص المشروع: تجهيز مطبخ إنتاجي لتدريب وتشغيل 40 أسرة منتجة.", 0, 40)] },
  scores,
  maxScore: 5,
  budget: { status: "ready", outputId: "o-bud", value: [
    { id: "b1", item: "معدات المطبخ الصناعي", amountHalalas: SAR(168_000), flag: { reason: "أعلى من متوسط السوق بنحو ٢٠٪", evidence: [ev(11, "معدات المطبخ الصناعي: 168,000 ريال", 0, 22)] } },
    { id: "b2", item: "التدريب والتأهيل", amountHalalas: SAR(92_000) },
    { id: "b3", item: "المواد الخام للأشهر الثلاثة الأولى", amountHalalas: SAR(66_000) },
    { id: "b4", item: "التسويق والتغليف", amountHalalas: SAR(60_000) },
  ] },
  schedule: { status: "ready", outputId: "o-sch", value: [
    { id: "s1", label: "الدفعة الأولى", dueLabel: "عند توقيع الاتفاقية", amountHalalas: SAR(140_000), deliverable: "خطة التنفيذ التفصيلية" },
    { id: "s2", label: "الدفعة الثانية", dueLabel: "الشهر الرابع", amountHalalas: SAR(140_000), deliverable: "تقرير تجهيز المطبخ وتدريب الدفعة الأولى" },
    { id: "s3", label: "الدفعة الختامية", dueLabel: "بعد التقرير الختامي", amountHalalas: SAR(70_000), deliverable: "التقرير الختامي السردي والمالي" },
  ] },
  recommendation: { status: "ready", outputId: "o-rec", value: { decision: "approve_modified", amountHalalas: SAR(350_000), rationale: "يوصى بالموافقة بمبلغ معدل 350,000 ريال بعد تخفيض بند المعدات إلى متوسط السوق، واشتراط تحديد شريك التسويق قبل الدفعة الثانية." } },
  history: [{ ref: "ط-2025-0188", title: "مشروع المطبخ المركزي", outcome: "مكتمل", amountHalalas: SAR(220_000) }],
  attachments: [{ id: "f-study", name: "دراسة المشروع.pdf", href: null }, { id: "f-bud", name: "الموازنة التفصيلية.xlsx", href: null }],
  judgement: { decision: null, amountHalalas: null, byName: null },
};

export const independentFile: StudyFileVM = {
  ...studyFile, mode: "independent", revealed: false,
  scores: scores.map((s) => ({ ...s, manih: null })),
};
export const revealedFile: StudyFileVM = {
  ...studyFile, mode: "independent", revealed: true,
  scores: scores.map((s, i) => ({ ...s, human: [4, 3, 3, 2, 4, 5][i]! })),
};

export const tasks: TaskVM[] = [
  { id: "t1", kind: "دراسة", title: mainApp.title, entity: { kind: "application", id: "app417", label: mainApp.ref, href: "/s/S2" }, whatYouNeedToDo: { status: "ready", outputId: "o-t1", value: "راجع الموازنة: بند المعدات أعلى من السوق، ثم احكم وارفع التوصية." }, dueLabel: "بعد ٣ أيام", dueTone: "near", href: "/s/S2" },
  { id: "t2", kind: "استكمال", title: "برنامج تدريب الخياطة المنزلية", entity: { kind: "application", id: "app422", label: "ط-2026-0422", href: "/s/S4" }, whatYouNeedToDo: { status: "ready", outputId: "o-t2", value: "ردت الجمعية على طلب الاستكمال؛ تحقق من شهادة الحساب البنكي الجديدة." }, dueLabel: "اليوم", dueTone: "late", href: "/s/S4" },
  { id: "t3", kind: "تسليم", title: "تقرير تجهيز المطبخ — مشروع م-2025-0102", entity: { kind: "deliverable", id: "d1", label: "م-2025-0102", href: "/s/P3" }, whatYouNeedToDo: { status: "plain", value: "راجع التسليم الثاني واحكم عليه." }, dueLabel: "بعد ٥ أيام", dueTone: "active", href: "/s/P3" },
];
