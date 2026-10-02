"use client";
import { useState, type ReactNode } from "react";
import type { AiState } from "@wbl/ui/ai";
import { AiFailed, AiPending, AiSuggestion, EntityBrief } from "@wbl/ui/ai";
import { Alert, Card, CardTitle, EmptyState, PageHeader } from "@wbl/ui";
import * as V from "@wbl/ui/views";
import { DONOR, VERSION, associations, independentFile, mainApp, otherApps, people, program, revealedFile, studyFile, tasks } from "./mock";

const SAR = (r: number) => r * 100;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ScreenDef = { id: string; title: string; journey: string; shell: "public" | "portal" | "staff"; role: string; render: () => ReactNode };

function useAi<T>(value: T, delay = 1200): [AiState<T> | null, () => void] {
  const [s, set] = useState<AiState<T> | null>(null);
  return [s, () => { set({ status: "pending", etaSeconds: 20 }); setTimeout(() => set({ status: "ready", value, outputId: "demo" }), delay); }];
}

function J2() {
  return <V.RegisterView letterHref="/s/J2-letter" onConfirm={() => { location.href = "/s/J3"; }}
    onLookup={async (l) => { await wait(400); return l === "0000" ? null : { name: "جمعية البر بالدار البيضاء", city: "الرياض", maskedPhone: "+966 5• ••• ••47", maskedEmail: "i•••@albir.org.sa" }; }} />;
}
function J5() {
  const [ex, run] = useAi({ type: "ترخيص الجمعية", number: "1287", issueDate: "2024-03-01", expiryDate: "2027-03-01" });
  const [done, setDone] = useState(false);
  if (done) return <div className="mx-auto max-w-xl p-6"><Alert tone="success" title="حُفظت الوثيقة" /></div>;
  return <V.DocumentUploadView docTypes={["ترخيص الجمعية", "شهادة الحساب البنكي", "النظام الأساسي", "محضر الجمعية العمومية"]} extraction={ex} onUpload={run} onConfirm={() => setDone(true)} />;
}
function J6() {
  const [values, setValues] = useState<Record<string, string>>({ title: "", need: "", goals: "", method: "", budget: "", beneficiaries: "" });
  const [prefilled, setPrefilled] = useState<string[]>([]);
  const [prefill, setPrefill] = useState<AiState<Record<string, string>> | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const amount = Number(values.budget || 0);
  return <V.ApplicationFormView programName={program.name} steps={["المشروع", "الأهداف والمنهجية", "الموازنة"]}
    fields={[
      { key: "title", label: "اسم المشروع", kind: "text", required: true, step: 1 },
      { key: "need", label: "وصف الاحتياج", kind: "textarea", required: true, step: 1 },
      { key: "goals", label: "الأهداف", kind: "textarea", required: true, step: 2 },
      { key: "method", label: "منهجية التنفيذ", kind: "textarea", required: true, step: 2 },
      { key: "budget", label: "المبلغ المطلوب (ريال)", kind: "number", required: true, step: 3 },
      { key: "beneficiaries", label: "عدد الأسر المستفيدة", kind: "number", required: true, step: 3 },
    ]}
    values={values} prefilled={prefilled} prefill={prefill} savedLabel="قبل دقيقة" submittedRef={submitted}
    checks={[
      { key: "ready", label: "الجاهزية", passed: true, detail: "الترخيص وشهادة الحساب البنكي ساريتان" },
      { key: "cap", label: "السقف", passed: amount <= 400_000, detail: amount <= 400_000 ? "المبلغ ضمن سقف 400,000 ريال" : "المبلغ يتجاوز سقف البرنامج 400,000 ريال" },
      { key: "dup", label: "التكرار", passed: true, detail: "لا طلب مفتوح آخر للجمعية" },
    ]}
    onChange={(k, v) => { setValues({ ...values, [k]: v }); setPrefilled(prefilled.filter((x) => x !== k)); }}
    onUsePrepared={async () => { setPrefill({ status: "pending", etaSeconds: 15 }); await wait(1200); setValues({ title: "مطبخ إنتاجي لتمكين ٤٠ أسرة", need: "مسح ميداني لـ ٦٢ أسرة أظهر أن ٧١٪ بلا دخل ثابت.", goals: "تمكين ٤٠ أسرة من دخل شهري لا يقل عن ٣٠٠٠ ريال.", method: "", budget: "386000", beneficiaries: "40" }); setPrefilled(["title", "need", "goals", "budget", "beneficiaries"]); setPrefill({ status: "ready", outputId: "p", value: {} }); }}
    onSubmit={() => setSubmitted("ط-2026-0417")} />;
}
function Stateful<T>({ init, children }: { init: T; children: (s: T, set: (v: T) => void) => ReactNode }) {
  const [s, set] = useState(init);
  return <>{children(s, set)}</>;
}

const brief = (now: string, waiting: string, risk?: string): AiState<{ now: string; waiting: string; risk?: string }> => ({ status: "ready", outputId: "b", value: { now, waiting, risk } });

export const screens: ScreenDef[] = [
  // ر١ — association
  { id: "J1", journey: "r1", role: "الجمعية", shell: "public", title: "صفحة البرنامج العامة", render: () => <V.ProgramPublicView program={program} /> },
  { id: "J2", journey: "r1", role: "الجمعية", shell: "public", title: "التسجيل برقم الترخيص", render: () => <J2 /> },
  { id: "J3", journey: "r1", role: "الجمعية", shell: "public", title: "رمز التحقق", render: () => <V.OtpView maskedPhone="+966 5• ••• ••47" onResend={() => {}} resendAfterSeconds={45} onVerify={async (c) => { if (c === "123456") { location.href = "/s/J4"; return { ok: true }; } return { ok: false, attemptsLeft: 2 }; }} /> },
  { id: "J4", journey: "r1", role: "الجمعية", shell: "portal", title: "لوحة الجمعية", render: () => <V.AssociationHomeView associationName="جمعية البر بالدار البيضاء" uploadHref="/s/J5"
      readiness={[{ key: "acct", label: "الحساب", ok: true }, { key: "bank", label: "شهادة الحساب البنكي", ok: false, reason: "انتهت في ١ أكتوبر ٢٠٢٦", actionHref: "/s/J5", actionLabel: "ارفع الشهادة الجديدة" }, { key: "lic", label: "الترخيص", ok: true }]}
      programs={[{ id: "p1", name: program.name, closesAt: program.closesAt, href: "/s/J6" }]}
      applications={[{ ...mainApp, href: "/s/J7", stage: "قيد الدراسة" }]}
      documents={[{ id: "d1", type: "ترخيص الجمعية", expiresAt: "2027-03-01", state: "valid", fileName: "license.pdf" }, { id: "d2", type: "شهادة الحساب البنكي", expiresAt: "2026-10-01", state: "expired", fileName: "bank.pdf" }, { id: "d3", type: "محضر الجمعية العمومية", expiresAt: "2026-10-20", state: "near", fileName: "minutes.pdf" }]} /> },
  { id: "J5", journey: "r1", role: "الجمعية", shell: "portal", title: "رفع وثيقة", render: () => <J5 /> },
  { id: "J6", journey: "r1", role: "الجمعية", shell: "portal", title: "نموذج التقديم", render: () => <J6 /> },
  { id: "J7", journey: "r1", role: "الجمعية", shell: "portal", title: "متابعة الطلب", render: () => <V.ApplicationTrackView application={mainApp} submittedOn="2026-10-06T08:30:00Z" waiting={null}
      stages={[{ key: "submitted", label: "أُرسل الطلب", state: "done", atLabel: "6 أكتوبر 2026" }, { key: "review", label: "قيد الدراسة", state: "current", atLabel: "7 أكتوبر 2026" }, { key: "approval", label: "الاعتماد", state: "upcoming" }, { key: "decision", label: "القرار", state: "upcoming" }, { key: "agreement", label: "الاتفاقية", state: "upcoming" }]} /> },
  // ر٢ — specialist, Manih first
  { id: "S1", journey: "r2", role: "الأخصائي", shell: "staff", title: "مهامي", render: () => <V.MyTasksView tasks={tasks} /> },
  { id: "S2", journey: "r2", role: "الأخصائي", shell: "staff", title: "ملف الدراسة", render: () => <V.StudyFileView file={studyFile} brief={brief("قيد الدراسة منذ يومين، فحوص النظام كلها ناجحة.", "ينتظر حكمك وتوصيتك", "المهلة بعد ٣ أيام")} actions={{ requestInfoHref: "/s/S4", submitRecommendationHref: "/s/S5", onConflict: () => alert("سُجّل التصريح وأُعيد إسناد الطلب.") }} /> },
  { id: "S3", journey: "r2", role: "الأخصائي", shell: "staff", title: "درج الدليل", render: () => <V.StudyFileView file={studyFile} initialEvidence={studyFile.scores[3]!.manih!.evidence[0]!} /> },
  { id: "S4", journey: "r2", role: "الأخصائي", shell: "staff", title: "مسودة طلب استكمال", render: () => <Stateful init={false}>{(sent, set) => <V.InfoRequestView appRef="ط-2026-0417" sent={sent} onSend={() => set(true)} missing={["عرض سعر معتمد لمعدات المطبخ", "اسم شريك التسويق وخطاب موافقته"]}
      draft={{ status: "ready", outputId: "o-msg", value: "السلام عليكم ورحمة الله،\nنشكر لكم تقديم طلب «مطبخ إنتاجي لتمكين ٤٠ أسرة». لاستكمال الدراسة نرجو تزويدنا بما يلي خلال ٥ أيام عمل:\n١. عرض سعر معتمد لمعدات المطبخ.\n٢. اسم شريك التسويق وخطاب موافقته.\nيمكنكم الاستكمال مباشرة من الإشعار." }} />}</Stateful> },
  { id: "S5", journey: "r2", role: "الأخصائي", shell: "staff", title: "رفع التوصية", render: () => <Stateful init={false}>{(done, set) => <V.SubmitRecommendationView appRef="ط-2026-0417" done={done} onSubmit={() => set(true)} suggested={{ decision: "approve_modified", amountHalalas: SAR(350_000) }} nextChain={["مدير المنح", "اللجنة", "المدير التنفيذي"]} />}</Stateful> },
  // ر٣ — independent study
  { id: "S2-indep", journey: "r3", role: "الأخصائي", shell: "staff", title: "ملف الدراسة، نمط مستقل", render: () => <V.StudyFileView file={independentFile} actions={{ onRecordAndReveal: () => { location.href = "/s/S2-reveal"; } }} /> },
  { id: "S2-reveal", journey: "r3", role: "الأخصائي", shell: "staff", title: "بعد الكشف", render: () => <V.StudyFileView file={revealedFile} /> },
  // ر٤ — manager
  { id: "M1", journey: "r4", role: "مدير المنح", shell: "staff", title: "الرئيسية لمدير المنح", render: () => <V.ManagerHomeView waiting={otherApps.slice(0, 2)} reassignHref="/s/M2"
      pipeline={[{ key: "submitted", label: "مقدّمة", count: 12, href: "#" }, { key: "in_review", label: "قيد الدراسة", count: 18, href: "#" }, { key: "awaiting_info", label: "بانتظار الاستكمال", count: 4, href: "#" }, { key: "in_approval", label: "في الاعتماد", count: 7, href: "#" }, { key: "approved", label: "معتمدة", count: 23, href: "#" }, { key: "rejected", label: "مرفوضة", count: 9, href: "#" }]}
      team={[{ id: "u1", person: people.sara, open: 11, late: 1, absent: false }, { id: "u2", person: people.khalid, open: 9, late: 0, absent: true }]}
      period={{ approvedHalalas: SAR(4_820_000), disbursedHalalas: SAR(2_310_000), budgetLeftHalalas: SAR(5_180_000), approvedHref: "#", disbursedHref: "#" }} /> },
  { id: "M2", journey: "r4", role: "مدير المنح", shell: "staff", title: "الترحيل", render: () => <Stateful init={false}>{(done, set) => <V.ReassignView done={done} applications={otherApps} recipients={[{ value: "u1", label: "سارة العتيبي" }, { value: "u3", label: "منيرة القحطاني" }]} onReassign={() => set(true)} />}</Stateful> },
  // ر٥ — committee
  { id: "C1", journey: "r5", role: "أمين اللجنة", shell: "staff", title: "ملف العرض على اللجنة", render: () => <V.CommitteePackView minutesHref="/s/C2" items={otherApps.map((a, i) => ({ id: a.id, ref: a.ref, title: a.title, association: a.association, summary: { status: "ready", outputId: `c${i}`, value: i === 0 ? studyFile.summary.status === "ready" ? studyFile.summary.value : "" : "مشروع تدريبي بموازنة متوازنة وأثر قابل للقياس." }, recommendation: i === 2 ? "موافقة" : "موافقة بمبلغ معدل", amountHalalas: [SAR(350_000), SAR(190_000), SAR(150_000)][i]!, historyLine: i === 0 ? "منحة سابقة مكتملة: 220,000 ريال (2025)" : "لا منح سابقة" }))} /> },
  { id: "C2", journey: "r5", role: "أمين اللجنة", shell: "staff", title: "رفع المحضر", render: () => <C2 /> },
  { id: "C3", journey: "r5", role: "أمين اللجنة", shell: "staff", title: "تأكيد القرارات", render: () => <C2 preloaded /> },
  // ر٦ — agreement → first deliverable
  { id: "A1", journey: "r6", role: "الأخصائي والجمعية", shell: "staff", title: "الاتفاقية", render: () => <Stateful init={{ a: null as string | null, d: null as string | null }}>{(s, set) => <V.AgreementView agreementRef="ات-2026-0417" title={mainApp.title} issuedAt="2026-11-02T09:00:00Z" previewHref="#" canUploadSigned canDonorSign associationSigned={s.a} donorSigned={s.d} onUploadSigned={() => set({ ...s, a: "رُفعت ٢ نوفمبر" })} onDonorSign={() => set({ ...s, d: "وقّع ٣ نوفمبر" })} />}</Stateful> },
  { id: "P1", journey: "r6", role: "الأخصائي", shell: "staff", title: "صفحة المشروع", render: () => <V.ProjectView title={mainApp.title} reference="م-2026-0031" status={{ tone: "active", label: "قيد التنفيذ" }}
      brief={brief("الدفعة الأولى صُرفت في ٥ نوفمبر.", "التسليم الثاني مستحق بعد ١٢ يوماً")}
      facts={[{ label: "الجمعية", value: associations.albir.label }, { label: "المبلغ المعتمد", value: <span className="font-mono">350,000</span> }, { label: "نسخة الإطار", value: <span className="font-mono">{VERSION}</span> }, { label: "الأخصائي", value: people.sara.label }]}
      installments={[{ id: "i1", label: "الدفعة الأولى", amountHalalas: SAR(140_000), state: "صُرفت", tone: "done" }, { id: "i2", label: "الدفعة الثانية", amountHalalas: SAR(140_000), state: "مستحقة بعد التسليم", tone: "neutral" }, { id: "i3", label: "الدفعة الختامية", amountHalalas: SAR(70_000), state: "بعد الإقفال", tone: "neutral" }]}
      deliverables={[{ id: "d1", label: "خطة التنفيذ التفصيلية", dueLabel: "١٠ نوفمبر", state: "مقبول", tone: "done", href: null }, { id: "d2", label: "تقرير التجهيز وتدريب الدفعة الأولى", dueLabel: "١ مارس", state: "قيد العمل", tone: "active", href: "/s/P2" }]}
      attachments={[{ id: "x", name: "الاتفاقية الموقعة.pdf", href: null }]}
      activity={[{ id: "1", at: "2026-11-05T10:00:00Z", atLabel: "5 نوفمبر", actor: "ريم الحربي", text: "نفذت صرف الدفعة الأولى" }, { id: "2", at: "2026-11-03T10:00:00Z", atLabel: "3 نوفمبر", actor: "عبدالله الملاحي", text: "وقّع الاتفاقية عن المانح" }, { id: "3", at: "2026-11-02T10:00:00Z", atLabel: "2 نوفمبر", actor: "مانح", text: "اقترح جدول التسليمات", ai: true }]} /> },
  { id: "P2", journey: "r6", role: "الجمعية", shell: "portal", title: "رفع تسليم", render: () => <Stateful init={false}>{(done, set) => <V.DeliverableUploadView label="تقرير التجهيز وتدريب الدفعة الأولى" dueLabel="١ مارس" done={done} onSubmit={() => set(true)} />}</Stateful> },
  { id: "P3", journey: "r6", role: "الأخصائي", shell: "staff", title: "مراجعة التسليم", render: () => <Stateful init={null as string | null}>{(o, set) => <V.DeliverableReviewView label="تقرير التجهيز وتدريب الدفعة الأولى" outcome={o} onDecide={(d) => set(d)}
      review={{ status: "ready", outputId: "o-dr", value: { matches: [{ requirement: "تجهيز المطبخ بالمعدات المعتمدة", met: true, note: "فواتير المعدات مرفقة وتطابق البند المعدل" }, { requirement: "تدريب ٢٠ أسرة في الدفعة الأولى", met: true, note: "كشف الحضور يذكر ٢٢ أسرة" }, { requirement: "تحديد شريك التسويق", met: false, note: "لم يُرفق خطاب الشريك" }], gaps: ["خطاب موافقة شريك التسويق"] } }} />}</Stateful> },
  // ر٧ — finance
  { id: "F1", journey: "r7", role: "المالية", shell: "staff", title: "الرئيسية للمالية", render: () => <V.FinanceHomeView
      awaiting={[{ id: "o1", ref: "أص-2026-0091", association: associations.albir, amountHalalas: SAR(140_000), state: "بانتظار التنفيذ", tone: "active", href: "/s/F2", dueLabel: "اليوم" }]}
      returned={[{ id: "o2", ref: "أص-2026-0087", association: associations.namaa, amountHalalas: SAR(60_000), state: "موقوف", tone: "late", reason: "شهادة الحساب البنكي منتهية", href: null }]}
      upcoming={[{ id: "o3", ref: "—", association: associations.aytam, amountHalalas: SAR(75_000), state: "بعد قبول التسليم", tone: "neutral", href: null, dueLabel: "١٥ نوفمبر" }]} /> },
  { id: "F2", journey: "r7", role: "المالية", shell: "staff", title: "أمر الصرف", render: () => <Stateful init={null as "executed" | "returned" | null}>{(o, set) => <V.DisbursementOrderView outcome={o} onExecute={() => set("executed")} onReturn={() => set("returned")}
      order={{ ref: "أص-2026-0091", association: { ...associations.albir, href: null }, project: { kind: "project", id: "pr", label: "م-2026-0031", href: null }, amountHalalas: SAR(140_000), installment: "الدفعة الأولى", account: { bank: "مصرف الراجحي", ibanMasked: "SA•• •••• •••• •••• 4471", acknowledged: true }, blockers: [] }} />}</Stateful> },
  // ر٨ — executive
  { id: "E1", journey: "r8", role: "المدير التنفيذي", shell: "staff", title: "الرئيسية للمدير التنفيذي", render: () => <Stateful init={["decide", "money", "team"] as Array<"decide" | "money" | "team">}>{(order, set) => <V.ExecutiveHomeView order={order} onReorder={set} decide={[otherApps[2]!]}
      money={[{ label: "الميزانية السنوية", valueHalalas: SAR(10_000_000), href: null }, { label: "المعتمد", valueHalalas: SAR(4_820_000), href: "#" }, { label: "المصروف", valueHalalas: SAR(2_310_000), href: "#" }]}
      team={[{ id: "u1", person: people.sara, open: 11, late: 1, absent: false }, { id: "u2", person: people.khalid, open: 9, late: 0, absent: true }, { id: "u3", person: people.manager, open: 3, late: 0, absent: false }]} />}</Stateful> },
  { id: "E2", journey: "r8", role: "المدير التنفيذي", shell: "staff", title: "لوحة الأوامر بسؤال", render: () => <V.AskView initial={{ q: "كم صرفنا على مجال التمكين هذا العام؟", answer: { understood: "مجموع الدفعات المنفذة · مصرف: التمكين الاقتصادي · ٢٠٢٦", value: "1,240,000 ريال", listHref: "#" } }} onAsk={async (q) => (q.includes("صرف") ? { understood: "مجموع الدفعات المنفذة · ٢٠٢٦", value: "2,310,000 ريال", listHref: "#" } : { notUnderstood: true })} /> },
  // ر٩ — system admin onboarding
  { id: "G1", journey: "r9", role: "مدير النظام", shell: "staff", title: "قائمة الإعداد", render: () => <V.SetupChecklistView steps={[
      { key: "identity", label: "هوية المانح وشعاره", done: true, required: true, href: null },
      { key: "policy", label: "سياسة المنح المعتمدة", done: true, required: true, href: "/s/G2" },
      { key: "config", label: "الإعدادات المشتقة: المعايير والأهلية والسلاسل", done: false, required: true, href: "/s/G3", suggestion: "٦ معايير مقترحة من السياسة" },
      { key: "users", label: "المستخدمون والأدوار", done: false, required: true, href: null },
      { key: "templates", label: "قوالب الاتفاقية والخطابات", done: false, required: false, href: null, suggestion: "القالب الافتراضي جاهز" }]} /> },
  { id: "G2", journey: "r9", role: "مدير النظام", shell: "staff", title: "بناء السياسة", render: () => <G2 /> },
  { id: "G3", journey: "r9", role: "مدير النظام", shell: "staff", title: "الإعدادات المشتقة", render: () => <G3 /> },
  { id: "G4", journey: "r9", role: "مدير النظام", shell: "staff", title: "نسخة الإطار", render: () => <V.FrameworkVersionView number={VERSION} approvedBy="عبدالله الملاحي" approvedAt="2026-10-02T09:00:00Z" reason="إطلاق دورة ١٤٤٨" changes={["إضافة برنامج تمكين الأسر المنتجة ١٤٤٨", "ستة معايير بأوزانها", "سقف ٤٠٠,٠٠٠ ريال للطلب", "مسار اعتماد: مدير المنح ← اللجنة ← المدير التنفيذي فوق ٣٠٠,٠٠٠"]} /> },
  // ر١٠ — operator
  { id: "O1", journey: "r10", role: "مشغّل وبل", shell: "staff", title: "صحة المنصة", render: () => <V.OperatorHealthView
      donors={[{ id: "d1", name: DONOR, plan: "مؤسسي", completed: 64, status: "نشط", tone: "done", supportUntil: null }, { id: "d2", name: "مؤسسة تجريبية ٢", plan: "أساسي", completed: 7, status: "تهيئة", tone: "active", supportUntil: "٤ أكتوبر ١٨:٠٠" }]}
      incidents={[{ id: "i1", title: "تأخر ردود مانح أكثر من ١٠ دقائق", tone: "near", state: "قيد المتابعة" }]} /> },
  // shared entity pages
  { id: "D1", journey: "pages", role: "الأخصائي", shell: "staff", title: "صفحة الجمعية", render: () => <V.AssociationPageView name={associations.albir.label} reference="ترخيص 1287" status={{ tone: "done", label: "جاهزة" }}
      brief={brief("طلب واحد قيد الدراسة ومنحة سابقة مكتملة.", "لا شيء ينتظر الجمعية الآن", "شهادة الحساب البنكي منتهية")}
      facts={[{ label: "المدينة", value: "الرياض" }, { label: "سنة التأسيس", value: <span className="font-mono">2009</span> }]}
      applications={[{ id: "a", entity: { kind: "application", id: "app417", label: `${mainApp.ref} ${mainApp.title}`, href: "/s/S2" }, stage: "قيد الدراسة", tone: "active" }]}
      grants={[{ id: "g", entity: { kind: "grant", id: "g1", label: "ط-2025-0188 مشروع المطبخ المركزي", href: null }, amountHalalas: SAR(220_000) }]}
      spentHalalas={SAR(220_000)} rating="أ" evaluations={[{ id: "e", text: "٢٠٢٥: أداء ممتاز، التزام بالمواعيد، وتجاوز المستهدف بـ ١٢٪." }]}
      activity={[{ id: "1", at: "2026-10-06T08:30:00Z", atLabel: "6 أكتوبر", actor: "الجمعية", text: "قدّمت الطلب ط-2026-0417" }]} /> },
  { id: "D2", journey: "pages", role: "الأخصائي", shell: "staff", title: "حيثيات القرار", render: () => <V.DecisionRationaleView appRef="ط-2026-0417" title={mainApp.title} decision="موافقة بمبلغ 350,000 ريال" decidedAt="2026-10-28T11:00:00Z" frameworkVersion={VERSION}
      scores={revealedFile.scores.map((s) => ({ criterion: s.criterion, weight: s.weight, manih: studyFile.scores.find((x) => x.criterion === s.criterion)?.manih?.score ?? null, human: s.human ?? 0 }))}
      recommendations={[{ by: "مانح", text: "موافقة بمبلغ معدل 350,000 ريال بعد تخفيض بند المعدات.", ai: true }, { by: "سارة العتيبي — الأخصائية", text: "أوافق على التعديل، وأشترط شريك التسويق قبل الدفعة الثانية." }]}
      approvers={[{ level: "مدير المنح", by: "منيرة القحطاني", action: "اعتمد", atLabel: "20 أكتوبر" }, { level: "اللجنة", by: "فهد الدوسري (أمين اللجنة)", action: "اعتمد من المحضر", atLabel: "27 أكتوبر" }, { level: "المدير التنفيذي", by: "عبدالله الملاحي", action: "اعتمد", atLabel: "28 أكتوبر" }]}
      minutes={{ name: "محضر اللجنة ١٤٤٨-٠٤.pdf", href: null, decisionLine: "البند ٣: الموافقة على الطلب ط-2026-0417 بمبلغ 350,000 ريال" }} /> },
  { id: "STATES", journey: "states", role: "الكل", shell: "staff", title: "الحالات", render: () => <States /> },
];

function C2({ preloaded }: { preloaded?: boolean }) {
  const decisions = otherApps.map((a, i) => ({ applicationId: a.id, ref: a.ref, title: a.title, decision: (i === 1 ? "reject" : "approve") as "approve" | "reject", amountHalalas: i === 1 ? null : [SAR(350_000), 0, SAR(150_000)][i]!, evidence: { fileId: "m", fileName: "محضر اللجنة.pdf", page: 2 + i, span: null, excerpt: `البند ${i + 3}: ${i === 1 ? "الاعتذار عن" : "الموافقة على"} الطلب ${a.ref}` } }));
  const [state, setState] = useState<AiState<typeof decisions> | null>(preloaded ? { status: "ready", outputId: "ce", value: decisions } : null);
  const [done, setDone] = useState(false);
  return <V.CommitteeMinutesView extraction={state} done={done} onConfirm={() => setDone(true)}
    onUpload={() => { setState({ status: "pending", etaSeconds: 40 }); setTimeout(() => setState({ status: "ready", outputId: "ce", value: decisions }), 1200); }} />;
}
function G2() {
  const [d, setD] = useState<AiState<V.PolicyClause[]> | null>(null);
  const [ok, setOk] = useState(false);
  return <V.PolicyBuilderView draft={d} approved={ok} onApprove={() => setOk(true)} onUpload={() => { setD({ status: "pending", etaSeconds: 90 }); setTimeout(() => setD({ status: "ready", outputId: "pd", value: [
    { id: "1", text: "تدعم المؤسسة الجمعيات المرخصة في مجالات التمكين الاقتصادي والتعليم والرعاية.", source: "اللائحة، ص ٢" },
    { id: "2", text: "لا يتجاوز دعم الطلب الواحد ٤٠٠,٠٠٠ ريال.", source: "اللائحة، ص ٤" },
    { id: "3", text: "يُعرض كل طلب يتجاوز ٣٠٠,٠٠٠ ريال على المدير التنفيذي بعد اللجنة.", source: "مصفوفة الصلاحيات، ص ١" },
    { id: "4", text: "يُشترط ألا يكون على الجمعية التزامات متأخرة مع المؤسسة.", source: null }] }), 1200); }} />;
}
function G3() {
  const [sim, setSim] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  return <V.DerivedConfigView approved={ok} onApprove={() => setOk(true)} simulation={sim} onSimulate={() => setSim("على ٢٠ طلباً سابقاً: ١٧ تطابق قرارها الفعلي، و٣ تُرد آلياً لتجاوز السقف.")}
    config={{ status: "ready", outputId: "dc", value: { criteria: program.criteria, eligibility: [{ when: "license.valid = false", then: "يُرد: الترخيص غير ساري" }, { when: "amount > 400,000", then: "يُرد: يتجاوز السقف" }, { when: "overdue_obligations > 0", then: "يُرد: التزامات متأخرة" }], chain: ["مدير المنح", "اللجنة", "المدير التنفيذي (إن تجاوز 300,000)"] } }} />;
}
function States() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="الحالات" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardTitle>الفراغ</CardTitle><EmptyState title="لا طلبات مسندة إليك الآن.">ستصلك الإشعارات عند الإسناد.</EmptyState></Card>
        <Card><CardTitle>التحميل</CardTitle><div aria-busy="true" className="flex flex-col gap-2">{[1, 2, 3].map((i) => <div key={i} className="h-6 animate-pulse rounded-sm bg-neutral-100" />)}</div></Card>
        <Card><CardTitle>مانح يجهّز</CardTitle><AiPending etaSeconds={90} onManual={() => {}} /></Card>
        <Card><CardTitle>تعذّر</CardTitle><AiFailed reason="لم يصل رد مانح خلال المهلة" onManual={() => {}} /></Card>
        <Card><CardTitle>بلا صلاحية</CardTitle><Alert tone="info" title="لا تملك صلاحية الاطلاع.">اطلب الإسناد من مدير المنح.</Alert></Card>
        <Card><CardTitle>الذكاء معطّل</CardTitle><AiSuggestion state={{ status: "disabled" }} render={() => null} manual={<textarea aria-label="الملخص" className="w-full rounded-sm border border-border p-2" placeholder="اكتب ملخصك للطلب" />} /></Card>
        <Card><CardTitle>«الخلاصة الآن»: جاهز</CardTitle><EntityBrief state={brief("قيد الدراسة.", "ينتظر حكمك")} /></Card>
        <Card><CardTitle>«الخلاصة الآن»: معدَّل</CardTitle><AiSuggestion state={{ status: "edited", value: "ملخص معدّل", original: "الملخص الأصلي", outputId: "e" }} render={(s) => <p>{s}</p>} manual={null} /></Card>
      </div>
    </div>
  );
}

export const journeys: Array<{ id: string; title: string; role: string }> = [
  { id: "r1", title: "ر١ · من صفحة البرنامج إلى متابعة الطلب", role: "الجمعية" },
  { id: "r2", title: "ر٢ · دراسة طلب بنمط «مانح أولاً»", role: "الأخصائي" },
  { id: "r3", title: "ر٣ · دراسة مستقلة: الحجب ثم الكشف", role: "الأخصائي" },
  { id: "r4", title: "ر٤ · التعطل والترحيل", role: "مدير المنح" },
  { id: "r5", title: "ر٥ · اللجنة من المحضر", role: "أمين اللجنة" },
  { id: "r6", title: "ر٦ · الاتفاقية إلى أول تسليم", role: "الأخصائي والجمعية" },
  { id: "r7", title: "ر٧ · التنفيذ أو الإرجاع", role: "المالية" },
  { id: "r8", title: "ر٨ · الصورة الكلية والسؤال", role: "المدير التنفيذي" },
  { id: "r9", title: "ر٩ · تهيئة مانح بالذكاء", role: "مدير النظام" },
  { id: "r10", title: "ر١٠ · صحة المنصة", role: "مشغّل وبل" },
  { id: "pages", title: "صفحات العناصر", role: "—" },
  { id: "states", title: "٩٠ · الحالات", role: "—" },
];
