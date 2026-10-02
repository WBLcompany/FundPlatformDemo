import { expect, test, type Page } from "@playwright/test";
import { login, pdf, resetDb, setAi, sql, until } from "./helpers";

/*
 * T-59 · R-019 → R-075: one application from the form to a closed project, through every role's
 * real screen. Runs twice: with the Manih mock (AI on) and with AI disabled for the donor (R-089:
 * every AI feature has a manual fallback, so the same cycle must complete without it).
 */
const SCHEDULE = [
  "الدفعة الأولى | 40 | signature | خطة التنفيذ | 14",
  "الدفعة الثانية | 40 | deliverable | تقرير الإنجاز المرحلي | 120",
  "الدفعة الختامية | 20 | final_report | التقرير الختامي | 330",
].join("\n");

async function fillApplication(page: Page, title: string) {
  const values: Record<string, string> = {
    "وصف الاحتياج": "تحتاج الأسر المنتجة في الحي إلى أدوات وتدريب لتسويق منتجاتها.",
    "اسم المشروع": title,
    "الأهداف": "تمكين ثلاثين أسرة من دخل مستقر خلال سنة.",
    "منهجية التنفيذ": "تدريب ثم تجهيز ثم متابعة شهرية.",
    "المؤشرات القابلة للقياس": "عدد الأسر ذات الدخل الشهري المنتظم.",
    "المبلغ المطلوب (ريال)": "50000",
    "بنود الموازنة (بند: مبلغ في كل سطر)": "أدوات: 30000\nتدريب: 20000",
    "عدد المستفيدين": "30",
  };
  for (let step = 1; step <= 3; step++) {
    for (const field of await page.locator("main textarea, main input[type=text], main input[type=number]").all()) {
      const label = (await field.evaluate((e) => (e as HTMLInputElement).labels?.[0]?.innerText ?? "")).replace(/\s*\*$/, "").trim();
      if (values[label] !== undefined) await field.fill(values[label]);
    }
    if (step < 3) await page.getByRole("button", { name: "التالي" }).click();
  }
}

for (const aiEnabled of [true, false]) {
  test.describe.serial(`full cycle · AI ${aiEnabled ? "on (Manih mock)" : "disabled"}`, () => {
    const title = aiEnabled ? "تمكين الأسر المنتجة في الحي" : "تمكين الأسر يدوياً";
    let appId = "";

    test.beforeAll(() => {
      resetDb();
      setAi(aiEnabled);
    });

    test("the association submits an application (R-019, R-022)", async ({ browser }) => {
      const page = await login(browser, "owner@albir.demo");
      await expect(page.getByText("جمعيتك جاهزة للتقديم")).toBeVisible();
      await page.goto("/portal/applications/new?program=family-empowerment-1448");
      await page.waitForURL(/\/edit$/);
      appId = page.url().split("/").at(-2)!;
      await fillApplication(page, title);
      await expect(page.getByText(/حُفظ تلقائياً/)).toBeVisible();
      await page.getByRole("button", { name: "أرسل الطلب" }).click();
      await expect(page.getByText(/أُرسل الطلب برقم ط-\d{4}-\d{4}/)).toBeVisible();
      expect(sql(`select status from cycle.applications where id = '${appId}'`)).toBe("submitted");
    });

    test("the assigned specialist studies and recommends (R-023, R-038)", async ({ browser }) => {
      const holder = sql(`select p.email from cycle.custody c join iam.memberships m on m.tenant_id = c.tenant_id and m.id = c.membership_id join iam.persons p on p.id = m.person_id where c.application_id = '${appId}' and c.to_at is null`);
      expect(holder).toMatch(/@almulhi\.demo$/);
      if (aiEnabled) await until(`select status from cycle.ai_outputs where subject_id = '${appId}' and task = 'application.study_file'`, "ready");
      else expect(sql(`select count(*) from cycle.ai_outputs where subject_id = '${appId}'`)).toBe("0");

      const page = await login(browser, holder);
      await page.goto(`/staff/applications/${appId}`);
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      if (aiEnabled) await expect(page.locator("p", { hasText: "ملخص مانح" })).toBeVisible();
      else await expect(page.getByText("الذكاء معطّل لهذا المانح. كل الإجراءات متاحة يدوياً.")).toBeVisible();

      for (const input of await page.getByLabel(/^درجتك — /).all()) await input.fill("4");
      const schedule = page.getByLabel("جدول الدفعات والتسليمات");
      if (aiEnabled) await expect(schedule).toHaveValue(/signature/); // Manih's draft, editable, saved only by the specialist
      else {
        await page.getByLabel("ملخصك", { exact: true }).fill("طلب مكتمل وموازنته معقولة.");
        await schedule.fill(SCHEDULE);
      }
      await page.getByRole("button", { name: "احفظ الحكم" }).click();
      await expect(page.getByText("حُفظ حكمك")).toBeVisible();

      await page.goto(`/staff/applications/${appId}/recommend`);
      await page.getByLabel("القرار").selectOption("approve");
      await page.getByLabel("المبلغ الموصى به (ريال)").fill("45000");
      await page.getByLabel(/مبررات التوصية/).fill("الطلب مكتمل والموازنة معقولة بعد تعديل بسيط.");
      await page.getByRole("button", { name: "ارفع التوصية إلى مسار الاعتماد" }).click();
      await page.waitForURL(new RegExp(`/staff/applications/${appId}$`));
      expect(sql(`select status from cycle.applications where id = '${appId}'`)).toBe("in_approval");
    });

    test("the grants manager approves; the budget is reserved and the agreement issued (R-042, R-048)", async ({ browser }) => {
      const page = await login(browser, "manager@almulhi.demo");
      await page.goto("/staff/home");
      const row = page.getByRole("row", { name: new RegExp(title) });
      await expect(row).toContainText("جمعية البر بالدار البيضاء");
      await row.getByRole("link").first().click();
      await page.getByLabel("احكم").selectOption({ label: "اعتمد" });
      await page.getByLabel("الملاحظات").fill("موافق.");
      await page.getByRole("button", { name: "احكم" }).click();
      await expect(page.getByRole("link", { name: "الاتفاقية" })).toBeVisible();
      expect(sql(`select status from cycle.applications where id = '${appId}'`)).toBe("agreement");
      expect(sql(`select status from project.agreements where application_id = '${appId}'`)).toBe("issued");
    });

    test("both parties sign; the project and its payment plan are created (R-050, R-052)", async ({ browser }) => {
      const assoc = await login(browser, "owner@albir.demo");
      const todo = assoc.getByRole("link", { name: "افتح" }).first();
      await expect(assoc.getByText(/اتفاقية الطلب .* جاهزة/)).toBeVisible();
      await todo.click();
      await expect(assoc.getByRole("button", { name: "وقّع عن المانح" })).toHaveCount(0);
      await assoc.locator("input[type=file]").setInputFiles(pdf);
      await expect(assoc.getByText("وقّعت الجمعية").locator("..")).not.toContainText("بانتظار");

      const agreementId = sql(`select id from project.agreements where application_id = '${appId}'`);
      const mgr = await login(browser, "manager@almulhi.demo");
      // T-24: the upload is served only after the worker has scanned it clean.
      const signedFile = sql(`select signed_file_id from project.agreements where id = '${agreementId}'`);
      await until(`select scan_status from kernel.files where id = '${signedFile}'`, "clean");
      expect((await mgr.request.get(`/api/files/${signedFile}`)).status()).toBe(200);
      await mgr.goto(`/staff/agreements/${agreementId}`);
      await mgr.getByRole("button", { name: "وقّع عن المانح" }).click();
      await expect(mgr.getByText("اكتمل التوقيعان. أُنشئ المشروع وخطة الدفعات.")).toBeVisible();
      expect(sql(`select status from project.projects where application_id = '${appId}'`)).toBe("active");
      expect(sql(`select count(*) from finance.installments i join project.projects p on p.tenant_id = i.tenant_id and p.id = i.project_id where p.application_id = '${appId}'`)).toBe("3");
    });

    test("finance approves and executes the first payment order (R-063)", async ({ browser }) => {
      await until(`select count(*) from finance.disbursement_orders o join project.projects p on p.tenant_id = o.tenant_id and p.id = o.project_id where p.application_id = '${appId}'`, "1");
      const orderId = sql(`select o.id from finance.disbursement_orders o join project.projects p on p.tenant_id = o.tenant_id and p.id = o.project_id where p.application_id = '${appId}'`);
      const page = await login(browser, "finance@almulhi.demo");
      await page.goto(`/staff/finance/orders/${orderId}`);
      await expect(page.getByText("جمعية البر بالدار البيضاء")).toBeVisible();
      await expect(page.getByText("18,000")).toBeVisible();
      await page.getByRole("button", { name: "اعتمد" }).click();
      await page.getByLabel("إثبات التحويل").setInputFiles(pdf);
      await page.getByLabel("مرجع النظام المالي").fill("TRX-1001");
      await page.getByRole("button", { name: "نفّذ بإثبات" }).click();
      await expect(page.getByText("نُفّذ الصرف وأُشعرت الجمعية وبريدها الرسمي.")).toBeVisible();
      expect(sql(`select status from finance.disbursement_orders where id = '${orderId}'`)).toBe("executed");
    });

    test("the association confirms receipt and submits the deliverable; staff accept it (R-066, R-070)", async ({ browser }) => {
      const projectId = sql(`select id from project.projects where application_id = '${appId}'`);
      const assoc = await login(browser, "owner@albir.demo");
      await assoc.goto(`/portal/projects/${projectId}`);
      await assoc.getByLabel(/ارفع مستند الاستلام/).setInputFiles(pdf);
      await assoc.getByRole("button", { name: "ارفع مستند الاستلام", exact: true }).click();
      await expect(assoc.getByText(/استُلم المستند/)).toBeVisible();

      // Every deliverable in the schedule: submitted by the association, accepted by the manager.
      const deliverables = sql(`select id from project.deliverables where project_id = '${projectId}' order by seq`).split("\n");
      expect(deliverables.length).toBeGreaterThan(0);
      const mgr = await login(browser, "manager@almulhi.demo");
      for (const deliverableId of deliverables) {
        await assoc.goto(`/portal/deliverables/${deliverableId}`);
        await assoc.getByLabel("ملفات التسليم").setInputFiles(pdf);
        await assoc.getByLabel(/عدد المستفيدين المتحقق/).fill("30");
        await assoc.getByLabel(/المصروف حتى الآن/).fill("18000");
        await assoc.getByRole("button", { name: "أرسل التسليم" }).click();
        await expect(assoc.getByText(/أُرسل التسليم/)).toBeVisible();

        await mgr.goto(`/staff/deliverables/${deliverableId}`);
        await mgr.getByRole("button", { name: "اقبل التسليم" }).click();
        await expect(mgr.getByText("قُبل التسليم وفُتح أمر صرف الدفعة المرتبطة.")).toBeVisible();
        expect(sql(`select status from project.deliverables where id = '${deliverableId}'`)).toBe("accepted");
      }
    });

    test("the final report closes the project; the audit chain is intact (R-073, R-075, R-093)", async ({ browser }) => {
      const projectId = sql(`select id from project.projects where application_id = '${appId}'`);
      const assoc = await login(browser, "owner@albir.demo");
      await assoc.goto(`/portal/projects/${projectId}`);
      await assoc.getByLabel("التقرير السردي").fill("نُفّذ المشروع كما خُطّط، وتحقق للأسر دخل منتظم.");
      await assoc.getByLabel("عدد المستفيدين").fill("30");
      await assoc.getByLabel("منهم إناث").fill("22");
      await assoc.getByLabel("المصروف (ريال)").fill("45000");
      await assoc.getByRole("button", { name: "أرسل التقرير الختامي" }).click();
      await expect(assoc.getByText(/أُرسل التقرير الختامي/)).toBeVisible();

      const mgr = await login(browser, "manager@almulhi.demo");
      await mgr.goto(`/staff/projects/${projectId}/final-report`);
      await mgr.getByLabel("احكم").selectOption("accept");
      await mgr.getByLabel("تقييم أداء الجمعية").selectOption("أ");
      await mgr.getByRole("button", { name: "احكم" }).click();
      await expect(mgr.getByText("مقبول")).toBeVisible();

      // The remaining payments (after the deliverable, after the final report) go through finance;
      // the last execution closes the project by itself (R-073), with no one opening a page.
      const fin = await login(browser, "finance@almulhi.demo");
      await until(`select count(*) from finance.disbursement_orders where project_id = '${projectId}'`, "3");
      for (const orderId of sql(`select id from finance.disbursement_orders where project_id = '${projectId}' and status <> 'executed' order by created_at`).split("\n")) {
        await fin.goto(`/staff/finance/orders/${orderId}`);
        if (await fin.getByRole("button", { name: "اعتمد" }).count()) await fin.getByRole("button", { name: "اعتمد" }).click();
        await fin.getByLabel("إثبات التحويل").setInputFiles(pdf);
        await fin.getByLabel("مرجع النظام المالي").fill(`TRX-${orderId.slice(0, 6)}`);
        await fin.getByRole("button", { name: "نفّذ بإثبات" }).click();
        await expect(fin.getByText("نُفّذ الصرف وأُشعرت الجمعية وبريدها الرسمي.")).toBeVisible();
      }
      await until(`select status from project.projects where id = '${projectId}'`, "closed");
      await assoc.goto(`/portal/projects/${projectId}`);
      await expect(assoc.getByText("قُبل التقرير الختامي وأُقفل المشروع.")).toBeVisible();
      const tenant = sql("select id from platform.donors where subdomain = 'almulhi'");
      expect(sql(`select kernel.verify_audit_chain('${tenant}') is null`)).toBe("t"); // null = no broken link
    });
  });
}
