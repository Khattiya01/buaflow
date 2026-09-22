import { test, expect } from "@playwright/test";

// Satisfies both the R0 primary-flow control and the R3 end-to-end-tests control: a real browser
// driving the real UI against the real production build and a real database — no mocks.
test("a member can sign in, add a task, and see it in their list", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("member@example.com");
  await page.getByLabel("Password").fill("member-dev-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByText("Write the runbook")).toBeVisible(); // seed data

  const title = `e2e task ${Date.now()}`;
  await page.getByPlaceholder("New task title").fill(title);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(title)).toBeVisible();

  // Status change round-trips through the real API.
  const row = page.getByTestId("task-row").filter({ hasText: title });
  await row.getByRole("combobox").selectOption("done");
  await expect(row.getByRole("combobox")).toHaveValue("done");

  // Delete removes it from the visible list (soft delete — proven at the API layer in tests/integration).
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(title)).not.toBeVisible();
});

test("signing out blocks access to /tasks again", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin-dev-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/tasks$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/tasks");
  await expect(page).toHaveURL(/\/login/); // proxy.ts redirect, not just a client-side guard
});

test("a wrong password shows an error and does not navigate away", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("member@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("invalid email or password")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
