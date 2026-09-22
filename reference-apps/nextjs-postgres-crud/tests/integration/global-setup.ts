import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export const TEST_PORT = 3101;
export const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let server: ChildProcess | undefined;

async function waitForHealth(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await delay(300);
  }
  throw new Error(`server did not become healthy within ${timeoutMs}ms`);
}

export async function setup() {
  // Deterministic starting data: drop and re-migrate, then seed explicitly. `migrate reset --force`
  // did not reliably trigger the configured migrations.seed hook under Prisma 7.10.0, so the seed
  // step is run as its own command rather than relied on implicitly.
  execFileSync("npx", ["prisma", "migrate", "reset", "--force"], {
    stdio: "inherit",
    shell: true,
  });
  execFileSync("node", ["--env-file=.env", "prisma/seed.mjs"], {
    stdio: "inherit",
    shell: true,
  });

  server = spawn("npx", ["next", "start", "--port", String(TEST_PORT)], {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  await waitForHealth(30_000);
}

export async function teardown() {
  if (!server || server.pid === undefined) return;
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    server.kill("SIGTERM");
  }
}
