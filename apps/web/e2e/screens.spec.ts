import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/*
 * Every screen renders for every role. Signs in as each role and follows every in-app link from
 * its landing page (breadth-first, GET only), failing on any 4xx/5xx or Next's error page.
 * Runs after cycle.spec.ts (files run in name order, one worker), so the crawl reaches the
 * agreement, project, deliverable and order pages that the cycle created.
 */
const ROLES: Array<{ email: string; start: string[] }> = [
  { email: "owner@albir.demo", start: ["/portal"] },
  { email: "sara@almulhi.demo", start: ["/staff"] },
  { email: "khalid@almulhi.demo", start: ["/staff"] },
  { email: "manager@almulhi.demo", start: ["/staff", "/staff/home"] },
  { email: "secretary@almulhi.demo", start: ["/staff"] },
  { email: "finance@almulhi.demo", start: ["/staff"] },
  { email: "ceo@almulhi.demo", start: ["/staff", "/staff/home"] },
  { email: "admin@almulhi.demo", start: ["/staff"] },
];
// Links that act rather than show (or create a record on GET) are not crawled.
const SKIP = [/^\/logout/, /^\/api\//, /^\/portal\/applications\/new/];
const MAX_PAGES = 60;

for (const role of ROLES) {
  test(`every reachable screen renders for ${role.email}`, async ({ browser }) => {
    const page = await login(browser, role.email);
    const seen = new Set<string>();
    const queue = [...role.start];
    const failures: string[] = [];
    while (queue.length && seen.size < MAX_PAGES) {
      const path = queue.shift()!;
      if (seen.has(path) || SKIP.some((r) => r.test(path))) continue;
      seen.add(path);
      const res = await page.goto(path);
      const status = res?.status() ?? 0;
      const body = await page.locator("body").innerText();
      if (status >= 400 || /This page couldn.t load|Application error/.test(body)) { failures.push(`${status} ${path}`); continue; }
      for (const href of await page.locator("a[href^='/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")!))) {
        const p = href.split("#")[0]!;
        if (!seen.has(p)) queue.push(p);
      }
    }
    expect(seen.size, "the crawl reached too few pages to mean anything").toBeGreaterThan(2);
    expect(failures, `broken screens for ${role.email}`).toEqual([]);
  });
}
