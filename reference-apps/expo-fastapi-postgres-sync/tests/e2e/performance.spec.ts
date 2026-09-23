import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

// performance control: a real, automated budget check (not a one-off manual observation).
// Budgets are generous for a local, un-tuned rehearsal machine and for a web bundle that
// also ships React Native's abstraction layer (react-native-web) — the point is that this
// check exists, runs on every clean-environment rehearsal, and fails loudly on regression.
const BUDGET_MS = 4000;
const OUT_DIR = path.join(process.cwd(), "..", "..", "evidence");

async function measure(page: import("@playwright/test").Page, url: string) {
  await page.goto(url);
  const timing = await page.evaluate(() => {
    const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    return { domContentLoaded: nav.domContentLoadedEventEnd, loadEvent: nav.loadEventEnd };
  });
  return timing;
}

test("login and tasks screens load within budget", async ({ page }) => {
  const login = await measure(page, "/");

  await page.getByLabel("Email").fill("member@example.com");
  await page.getByLabel("Password").fill("member-dev-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("tasks-screen")).toBeVisible();
  const tasks = await measure(page, "/");

  const report = { budgetMs: BUDGET_MS, login, tasks, generatedAt: new Date().toISOString() };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "performance-budget.json"), JSON.stringify(report, null, 2));

  expect(login.loadEvent, `login screen loadEvent: ${login.loadEvent}ms`).toBeLessThan(BUDGET_MS);
  expect(tasks.loadEvent, `tasks screen loadEvent: ${tasks.loadEvent}ms`).toBeLessThan(BUDGET_MS);
});
