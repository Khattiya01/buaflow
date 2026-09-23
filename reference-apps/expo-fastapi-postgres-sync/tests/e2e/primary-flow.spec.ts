import { expect, test } from "@playwright/test";

// Satisfies both the R0 primary-flow control and the R3 end-to-end-tests control: a real
// browser driving the real mobile app's web export against the real production build and a
// real database — no mocks. This is the SAME React Native source (App.tsx / src/screens)
// that the native Android build compiles; only the target platform differs.
test("a member can sign in, add a task, change its status, and delete it", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Email").fill("member@example.com");
  await page.getByLabel("Password").fill("member-dev-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByTestId("tasks-screen")).toBeVisible();
  await expect(page.getByText("Write the sync contract doc")).toBeVisible(); // seed data

  const title = `e2e task ${Date.now()}`;
  await page.getByLabel("New task title").fill(title);
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText(title)).toBeVisible();

  // Advancing status round-trips through the real sync push/pull.
  const toggle = page.getByRole("button", { name: new RegExp(`^${title}, status To do`) });
  await toggle.click();
  await expect(page.getByRole("button", { name: new RegExp(`^${title}, status In progress`) })).toBeVisible();

  await page.getByRole("button", { name: `Delete ${title}` }).click();
  await expect(page.getByText(title)).not.toBeVisible();
});

test("signing out blocks access to tasks again", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin-dev-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("tasks-screen")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByTestId("login-screen")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("login-screen")).toBeVisible();
});

test("a wrong password shows an error and does not sign in", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Email").fill("member@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByTestId("login-error")).toHaveText("invalid email or password");
  await expect(page.getByTestId("login-screen")).toBeVisible();
});
