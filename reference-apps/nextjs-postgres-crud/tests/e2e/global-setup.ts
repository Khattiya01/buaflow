import { execFileSync } from "node:child_process";

// Deterministic starting data for e2e runs — same seed the integration suite uses
// (admin@example.com / member@example.com, see prisma/seed.mjs).
export default async function globalSetup() {
  execFileSync("npx", ["prisma", "migrate", "reset", "--force"], { stdio: "inherit", shell: true });
  execFileSync("node", ["--env-file=.env", "prisma/seed.mjs"], { stdio: "inherit", shell: true });
}
