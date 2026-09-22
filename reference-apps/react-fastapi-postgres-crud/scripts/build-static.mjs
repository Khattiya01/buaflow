// Builds the React frontend and copies its output into backend/static, where
// app/main.py expects to find it (mounted via StaticFiles). Used before running e2e
// tests and rehearsal scripts locally; the Dockerfile does the equivalent copy itself
// as a build stage, so this script is not used inside the image build.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND = join(ROOT, "frontend");
const DIST = join(FRONTEND, "dist");
const STATIC = join(ROOT, "backend", "static");

// shell:true is required on Windows to spawn npm.cmd (a batch file) at all — Node refuses
// bare .cmd execution there since CVE-2024-27980. Arguments here are fixed, not
// user-supplied, so this is not the shell-injection footgun the Node docs warn about.
execFileSync("npm", ["run", "build"], { cwd: FRONTEND, stdio: "inherit", shell: true });

if (existsSync(STATIC)) rmSync(STATIC, { recursive: true, force: true });
cpSync(DIST, STATIC, { recursive: true });
console.log(`Copied ${DIST} -> ${STATIC}`);
