# عقد المهام مع مانح (T-09 · Q-6)

**المصدر:** مراجعة قراءة فقط لمستودع مانح (`fund-agent/apps/manih`) في ٢ أكتوبر ٢٠٢٦. المسارات أدناه نسبية إلى `apps/manih/src/`.
**الخلاصة:** مانح اليوم يملك سير عمل آلياً واحداً: تقديم طلب ثم استلام تقرير بـ webhook أو استعلام. بقية قدراته مسارات واجهة بجلسة المانح، أو حتمية. لا شيء يعيد دليلاً بالملف والصفحة والمقطع، ولا حجب للبيانات الشخصية سوى وثائق الحساب البنكي.

## ١. ما يملكه مانح اليوم من واجهة آلية

| البند | الواقع | الفجوة مع عقد المنصة |
| --- | --- | --- |
| التقديم | `POST /api/v1/applications` (`applications:write`) يعيد 202 ويعمل في `after()` | لا `task_type` ولا `idempotency_key` صريح؛ التكرار يُمنع بمفتاح `(donor, 'api', external_id)` |
| الاستعلام | `GET /api/v1/applications/{applicationId}` | لا `task_id` |
| التوثيق | `Authorization: Bearer mnh_live_…` بمفتاح لكل مانح، SHA-256 في `partner_api_keys` | مفتاح لكل مانح؛ المنصة متعددة العملاء تحتاج مفتاحاً لكل مانح أو ربط `tenant_ref` |
| الرد | `x-manih-signature` = hex HMAC-SHA256(secret, `timestamp + "." + body`)، و`x-manih-timestamp` بالملّي ثانية، و`x-manih-event` | لا معرّف حدث لمنع إعادة التشغيل؛ عنوان الرد لكل مفتاح لا لكل مهمة |
| المحاولة | ٣ محاولات، مهلة ١٥ ث، تأخير ١ ث ثم ٢ ث، على الشبكة و429 و5xx فقط | مقبول |
| نسخة الإطار | يقيّم دائماً على النسخة الحية ويسجّلها في `report.provenance` | المنصة تحتاج `framework_version_ref` مثبّتاً |

## ٢. خريطة المهام

| مهمة المنصة | في مانح اليوم | القرار |
| --- | --- | --- |
| `application.study_file` | `lib/ai/runAnalysis.ts` → `engine.ts`، ٩٠–١٦٠ ث، ~٠٫٠٧–٠٫٢٥$ | **يبقى في مانح.** يُغلَّف بعقد المهام |
| `document.extract` | `lib/ai/attachments.ts`، `pdfText.ts`، و`/api/extract` (٦٠ ث) | يُبنى في مانح كمهمة جديدة؛ لا يحقق مهلة ١٠ ث المتزامنة اليوم ← **غير متزامن** في المنصة |
| `proposal.prefill` | `/api/extract` يملأ حقول نموذج من ملف | يُعاد تغليفه في مانح |
| `policy.draft` | `lib/policy/builder/*` (٥٣–١٤٤ ث) مع تحقق الاقتباس `origin.ts` | يبقى في مانح؛ الدليل بالجملة دون رقم صفحة |
| `policy.derive_config` | `/api/knowledge/extract` | يبقى في مانح |
| `message.draft` | `lib/applicantFeedbackEmail.ts` حتمي يلف `report.applicantFeedback` | يُبنى في مانح |
| `query.interpret` | المحادثة بعشر أدوات مسماة بلا text-to-SQL | **ينتقل المبدأ لا الكود:** المنصة تملك الطبقة الدلالية (D-09)، ومانح يعيد نية JSON فقط |
| `entity.brief` | حتمي (`fundingHistory.ts`، `priorApplications.ts`) | المنصة تبنيه حتمياً من أحداثها، ومانح اختياري |
| الجدول والمعالم (`application.study_file`) | `lib/ai/milestones.ts` استدعاء ثانٍ بعد التقييم (~٠٫٠٠٧$) | يُضم إلى مخرج `study_file` |
| `invitation.fit` | جزئي داخل التقييم (`programFit`) | يُبنى في مانح |
| `committee.extract`، `deliverable.review`، `amendment.diff`، `final_report.review`، `performance.propose` | **لا مقابل** | تُبنى في مانح؛ المنصة تعمل بالبديل اليدوي حتى ذلك |

## ٣. ما يبقى في المنصة (لا يُنقل إلى مانح)

- الأهلية والسقوف والتكرار والموانع: `packages/rules` (حتمي). مانح يحسب `conditionChecks` ويخفض التوصية؛ المنصة لا تقبل ذلك قراراً بل دليلاً.
- حجب البيانات الشخصية قبل الإرسال: مانح لا يحجب الحقول. **الحجب مسؤولية المحوّل في المنصة** (`packages/adapters/manih/redact.ts`) مع خريطة إرجاع لا تغادر المنصة (R-112).
- الأرقام المعروضة كحقيقة، والحالة، والسجل.

## ٤. العقد المعتمد للمنصة (v1)

```
POST {MANIH_URL}/tasks
Authorization: Bearer <مفتاح المانح>
{ task_type, schema_version, tenant_ref, framework_version_ref, inputs, idempotency_key, callback_url }
→ 202 { task_id }

POST {PLATFORM}/api/hooks/manih
x-manih-signature: hex(HMAC-SHA256(secret, timestamp + "." + body))
x-manih-timestamp: <ms>
x-manih-event: task.completed | task.failed
{ task_id, idempotency_key, task_type, schema_version, status, output?, error?, model, package_version, cost_usd?, latency_ms? }

GET {MANIH_URL}/tasks/{task_id}   (احتياطي)
```

- التوقيع متوافق مع ترويسات مانح الحالية حرفياً، فيُعاد استخدام `verifyWebhookSignature` كما هو.
- المنصة ترفض ختماً زمنياً أقدم من ٥ دقائق، وترفض `task_id` سبق استلامه (منع إعادة التشغيل).
- كل مخرج يُتحقق منه بمخطط Zod بإصداره؛ المخالف يُرفض ويُعاد مرة ثم «تعذّر» (`packages/adapters/manih/schemas.ts`).
- الدليل `{file_id, page, span}` إلزامي في عقد المنصة. مانح لا يعيده اليوم، فالمحوّل يقبل `page = null` ويعرض «بلا موضع» حتى يُبنى.

## ٥. ما يلزم مانح ليطابق العقد (عمل في مستودع مانح، خارج هذا المستودع)

1. مسار `/tasks` بـ `task_type` و`idempotency_key` و`callback_url` لكل مهمة.
2. قبول `framework_version_ref` والتقييم على لقطة الإطار المرسلة لا على النسخة الحية.
3. معرّف حدث في الرد.
4. الدليل بالصفحة والمقطع.
5. المهام الخمس غير الموجودة.

حتى ذلك: المحوّل الوهمي (T-31) يطابق العقد ويجتاز الاختبارات نفسها (R-113).
