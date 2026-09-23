import { expect, test } from "@playwright/test";

// The sync/offline contract itself (see ../../docs/sync-contract.md), exercised end to end
// through the real UI, the real localStorage-backed web store (src/storage/webStore.ts),
// and the real backend — the one piece of this control that a unit test of the pure engine
// (mobile/src/sync/engine.test.ts) cannot prove: that a task created while genuinely
// offline (Playwright's real network-level offline emulation, not a mocked fetch) survives
// a reload and is durably pushed once connectivity returns.
test("a task created while offline is queued locally, then syncs once back online", async ({ page, context }) => {
  await page.goto("/");
  await page.getByLabel("Email").fill("member@example.com");
  await page.getByLabel("Password").fill("member-dev-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("tasks-screen")).toBeVisible();

  // Let the initial online sync settle before cutting the network, so the offline banner
  // transition below is unambiguously caused by going offline, not by startup timing.
  await expect(page.getByTestId("pending-count")).toHaveText("All changes synced");

  await context.setOffline(true);

  const title = `offline task ${Date.now()}`;
  await page.getByLabel("New task title").fill(title);
  await page.getByRole("button", { name: "Add task" }).click();

  // Created locally and visible immediately — offline-first, not "disabled while offline".
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.getByTestId(new RegExp("^task-unsynced-"))).toBeVisible();

  // A manual sync attempt while offline surfaces the offline banner instead of erroring.
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByTestId("offline-banner")).toBeVisible();
  await expect(page.getByTestId("pending-count")).toHaveText("1 change waiting to sync");

  // The task must have been durably persisted to the local store, not just held in React
  // state — read it back directly rather than via page.reload(), which itself requires a
  // network round trip for the page shell in a plain web SPA and would fail while the
  // browser context is genuinely offline (a real difference from the native build, whose
  // shell is bundled in the binary rather than fetched — see docs/sync-contract.md).
  const storedTasks = await page.evaluate(() => JSON.parse(localStorage.getItem("buaflow.sync.tasks.v1") ?? "[]"));
  expect(storedTasks.some((t: { title: string; dirty: boolean }) => t.title === title && t.dirty)).toBe(true);

  await context.setOffline(false);
  await page.getByRole("button", { name: "Sync now" }).click();

  await expect(page.getByTestId("offline-banner")).not.toBeVisible();
  await expect(page.getByTestId("pending-count")).toHaveText("All changes synced");
  // The unsynced badge is gone: the server round trip confirmed and cleared it.
  await expect(page.getByTestId(new RegExp("^task-unsynced-"))).toHaveCount(0);

  // Proves the push actually reached the server, not just that the local UI stopped
  // showing "unsynced": reload from a clean client state (fresh pull, no stale localStorage
  // task list) and confirm the task is still there.
  await page.evaluate(() => localStorage.removeItem("buaflow.sync.tasks.v1"));
  await page.evaluate(() => localStorage.removeItem("buaflow.sync.lastSyncedAt.v1"));
  await page.reload();
  await expect(page.getByText(title)).toBeVisible();
});
