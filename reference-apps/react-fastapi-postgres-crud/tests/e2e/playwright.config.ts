import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = 8010;
const BACKEND = path.join(process.cwd(), "..", "..", "backend");

export default defineConfig({
  testDir: "./",
  globalSetup: "./global-setup.ts",
  fullyParallel: false, // all specs share one server + one database
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "../../evidence/playwright-report.json" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `python -m uvicorn app.main:app --host 127.0.0.1 --port ${PORT}`,
    cwd: BACKEND,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
