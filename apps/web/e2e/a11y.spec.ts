import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login, resetDb, setAi } from "./helpers";

/*
 * T-62 · N-10, R-115: WCAG 2.2 AA with axe on every role's main screens (no serious or critical
 * violation), and the association portal at 360px with no horizontal scroll.
 */
async function audit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.passes.length, `axe evaluated nothing on ${path}`).toBeGreaterThan(10);
  const minor = r.violations.filter((v) => v.impact === "minor" || v.impact === "moderate");
  if (minor.length) console.log(`a11y ${path}: ${minor.map((v) => v.id).join(", ")}`);
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), `axe on ${path}`).toEqual([]);
}

test.describe.serial("accessibility and mobile", () => {
  test.beforeAll(() => { resetDb(); setAi(true); });

  test("public pages", async ({ page }) => {
    for (const p of ["/", "/login", "/register"]) await audit(page, p);
  });

  test("association portal, desktop and 360px", async ({ browser }) => {
    const page = await login(browser, "owner@albir.demo");
    for (const p of ["/portal", "/portal/applications", "/portal/documents", "/portal/account", "/portal/applications/new?program=family-empowerment-1448"]) await audit(page, p);
    await page.setViewportSize({ width: 360, height: 780 });
    for (const p of ["/portal", "/portal/applications", "/portal/documents", "/portal/account"]) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal scroll on ${p} at 360px`).toBeLessThanOrEqual(0);
    }
  });

  test("staff screens", async ({ browser }) => {
    const page = await login(browser, "manager@almulhi.demo");
    for (const p of ["/staff", "/staff/home", "/staff/applications", "/staff/projects", "/staff/associations", "/staff/finance", "/staff/reports", "/staff/committee"]) await audit(page, p);
  });
});
