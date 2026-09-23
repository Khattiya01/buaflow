import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

// accessibility control: automated WCAG 2.1 AA scan of the two screens a user can reach in
// the web export. React Native Web's accessibilityLabel/accessibilityRole props (used
// throughout mobile/src/screens) are what make this pass — the same props a screen reader
// on the native iOS/Android build would also rely on.
const OUT_DIR = path.join(process.cwd(), "..", "..", "evidence");

async function scanAndSave(page: import("@playwright/test").Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `axe-${name}.json`), JSON.stringify(results, null, 2));
  return results;
}

test("login screen has no critical/serious WCAG 2 A/AA violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("login-screen")).toBeVisible();
  const results = await scanAndSave(page, "login");
  const blocking = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});

test("tasks screen has no critical/serious WCAG 2 A/AA violations", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Email").fill("member@example.com");
  await page.getByLabel("Password").fill("member-dev-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("tasks-screen")).toBeVisible();

  const results = await scanAndSave(page, "tasks");
  const blocking = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});
