#!/usr/bin/env node
/**
 * assess.js — "which readiness level is this project at?" answered from the repository itself
 *
 *   node claude-setup/assess.js --root ../my-app
 *   node claude-setup/assess.js --root ../my-app --execute          # also run build/verify/tests
 *   node claude-setup/assess.js --root ../my-app --write docs/evidence/readiness.draft.json
 *   buaflow assess --root ../my-app --json
 *
 * ทำไมต้องมี (EV-009 K-2): คำถามแรกของคนที่รับโปรเจกต์เดิมเข้า kit คือ "ตอนนี้ฉันอยู่ตรงไหน"
 * แต่ readiness.js ตอบได้ก็ต่อเมื่อมีคนเขียน manifest มาก่อน — trial แรกต้องเขียน 10 control
 * ด้วยมือเพื่อให้ได้คำตอบ ทั้งที่ส่วนใหญ่เครื่องดูเองได้ ไฟล์นี้ probe repository แล้วเสนอ
 * สถานะให้ทุก control โดยไม่ต้องมี manifest และไม่ต้องติดตั้ง .claude/ ก่อน
 *
 * กติกาที่ทำให้มันไม่กลายเป็นเครื่องปั๊มคำว่าผ่าน:
 *
 *   pass     เฉพาะเมื่อ probe เป็นข้อยุติ — ไฟล์ที่เป็นหลักฐานได้ในตัวเองมีอยู่จริงและไม่ว่าง
 *            หรือคำสั่งถูกรันจริงด้วย --execute แล้ว exit 0
 *   fail     probe หาของที่ control นี้ต้องการไม่เจอเลย หรือคำสั่งที่รันจริง exit ไม่เป็นศูนย์
 *            หรือ config ของโปรเจกต์ประกาศเองว่าไม่มี (เช่น ciMode: local-only)
 *   pending  เจอของที่น่าจะใช่ แต่การตัดสินต้องใช้คนหรือต้องรันจริง — บอกเสมอว่าเจออะไร
 *            และต้องทำอะไรต่อ
 *
 * ไม่มีอะไรถูกตัดสินเป็น not-applicable อัตโนมัติ: ขอบเขตเป็นดุลพินิจของคน (หลักเดียวกับ
 * verifier.js) · "หาไม่เจอ" ของ probe ไม่ได้แปลว่า "ไม่มี" จึงบอกเสมอว่าหาด้วยวิธีไหน
 *
 * คำตอบมีสองระดับ ไม่ใช่ระดับเดียว:
 *   proven     ระดับสูงสุดที่ทุก control เป็น pass แล้ว
 *   reachable  ระดับสูงสุดที่ยังไม่มี control ไหน fail — ที่เหลือเป็น pending ที่คนปิดได้
 *   blockers   control ที่ fail ในระดับถัดจาก reachable = สิ่งที่ต้องแก้จริงก่อนขยับ
 *
 * --write เขียน draft manifest ที่มีสถานะตามที่ probe ได้ — pending ยังเป็น pending ดังนั้น
 * readiness.js จะตกกับ draft นี้อย่างซื่อตรงจนกว่าคนจะปิดช่องว่าง ไม่เขียนทับไฟล์ที่มีอยู่
 *
 * !! --execute รันคำสั่งจริงของโปรเจกต์ !! ความเชื่อถือเท่ากับ `npm run build` ของโปรเจกต์นั้น
 * และอาจเขียนไฟล์ (build output) — เหมือน verifier.js --execute
 *
 * exit 0 = ประเมินเสร็จ (ไม่ว่าจะได้ระดับไหน — การได้ R0 ไม่ใช่ความผิดพลาดของคำสั่ง)
 * exit 2 = input ผิด
 * ไม่มี dependency — Node ล้วน
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { CONTROLS_BY_LEVEL, LEVEL_ORDER, controlsFor, validateManifest } = require('./readiness.js');

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.next', 'coverage', '.venv', 'venv', '__pycache__',
  'target', '.turbo', '.expo', 'out', '.pytest_cache', '.mypy_cache', 'test-results', '.gradle', 'Pods',
]);
const MAX_FILES = 40000;
const RUN_COMMAND = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|serve|preview)\b|docker[ -]compose\s+up|\buvicorn\b|\bmanage\.py\s+runserver|\bdotnet\s+run\b|\bgo\s+run\b|\bexpo\s+start\b|\bflask\s+run\b|\brails\s+s(erver)?\b|\bphp\s+artisan\s+serve\b/i;
const DEFAULT_TIMEOUT_MS = 600000;

function walk(root) {
  const files = [];
  const stack = [''];
  while (stack.length && files.length < MAX_FILES) {
    const relative = stack.pop();
    let entries;
    try { entries = fs.readdirSync(path.join(root, relative), { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(child);
      } else if (entry.isFile()) files.push(child);
    }
  }
  return files.sort();
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

function readJson(file) {
  const text = readText(file);
  if (text === null) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function nonEmpty(root, relative) {
  try { return fs.statSync(path.join(root, relative)).size > 0; } catch { return false; }
}

function defaultRunner(command, { cwd, timeoutMs }) {
  const result = spawnSync(command, { cwd, shell: true, timeout: timeoutMs, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return {
    status: result.status,
    timedOut: result.error?.code === 'ETIMEDOUT',
    tail: String(result.stderr || result.stdout || '').split(/\r?\n/).filter((line) => line.trim()).slice(-1)[0]?.trim().slice(0, 200) || '',
  };
}

function gitRunner(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { status: result.error ? null : result.status, stdout: (result.stdout || '').trim() };
}

// Workspaces: the root and any first-level or apps/* / packages/* directory that owns a manifest.
// A brownfield monorepo (the first trial's backend/ + frontend/ with no root package.json) is the
// case this exists for — a probe that only looked at the root would find no build at all.
function workspaces(root, files) {
  const markers = ['package.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml', 'composer.json', 'pom.xml', 'build.gradle'];
  const found = new Map();
  for (const file of files) {
    const parts = file.split('/');
    const name = parts[parts.length - 1];
    const dir = parts.slice(0, -1).join('/');
    const depthOk = parts.length === 1 || parts.length === 2 || (parts.length === 3 && ['apps', 'packages', 'services'].includes(parts[0]));
    if (!depthOk) continue;
    if (markers.includes(name) || /\.csproj$/.test(name)) {
      if (!found.has(dir)) found.set(dir, []);
      found.get(dir).push(name);
    }
  }
  return [...found.entries()].map(([dir, marks]) => {
    const pkg = marks.includes('package.json') ? readJson(path.join(root, dir, 'package.json')) : null;
    let manager = 'npm';
    if (fs.existsSync(path.join(root, dir, 'pnpm-lock.yaml')) || fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) manager = 'pnpm';
    else if (fs.existsSync(path.join(root, dir, 'yarn.lock')) || fs.existsSync(path.join(root, 'yarn.lock'))) manager = 'yarn';
    return { dir, markers: marks, scripts: pkg?.scripts || {}, dependencies: { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) }, manager };
  }).sort((a, b) => a.dir.localeCompare(b.dir));
}

function scriptCommand(workspace, script) {
  if (!workspace.dir) return `${workspace.manager} run ${script}`;
  if (workspace.manager === 'npm') return `npm --prefix ${workspace.dir} run ${script}`;
  if (workspace.manager === 'pnpm') return `pnpm --dir ${workspace.dir} run ${script}`;
  return `yarn --cwd ${workspace.dir} run ${script}`;
}

function loadStack(root) {
  const file = path.join(root, '.claude', 'stack.json');
  if (!fs.existsSync(file)) return { present: false, config: null };
  return { present: true, config: readJson(file) };
}

const verdict = (status, reason, evidence = [], next = null) => ({ status, reason, evidence, next, basis: 'probe' });

function probe(root, options = {}) {
  const files = walk(root);
  const has = (regex) => files.filter((file) => regex.test(file));
  const ws = workspaces(root, files);
  const stack = loadStack(root);
  const git = options.gitRunner || gitRunner;
  const results = {};
  const notes = [];

  // ── R0 ────────────────────────────────────────────────────────────────
  const top = git(['rev-parse', '--show-toplevel'], root);
  const head = git(['rev-parse', 'HEAD'], root);
  let commit = null;
  if (top.status !== 0) {
    results['version-control'] = verdict('fail', 'not inside a git work tree', [], 'git init && git add -A && git commit');
  } else if (head.status !== 0) {
    results['version-control'] = verdict('fail', 'git work tree has no commits yet', [], 'make the first commit so readiness has a revision to bind to');
  } else {
    commit = head.stdout;
    results['version-control'] = verdict('pass', `HEAD is ${commit.slice(0, 12)}`, [{ type: 'command', value: 'git rev-parse HEAD' }]);
    if (path.resolve(top.stdout) !== path.resolve(root)) {
      // K-1: the project root is a subdirectory of a larger repository. Hooks, CI and the
      // commit identity all live at the git root, so this is worth saying out loud.
      notes.push(`project root is not the git root (${top.stdout}); hooks and CI install at the git root`);
    }
  }

  const docs = files.filter((file) => /^(README|AGENTS|CONTRIBUTING)\.md$|^docs\/(README|runbook|getting-started|setup|development|local-development)\.md$/i.test(file));
  const startDoc = docs.find((file) => RUN_COMMAND.test(readText(path.join(root, file)) || ''));
  const envExample = has(/(^|\/)\.env(\.[\w-]+)?\.example$|(^|\/)\.env\.sample$/);
  if (startDoc) {
    results['start-path'] = verdict('pass', `${startDoc} documents a start command`, [
      { type: 'file', value: startDoc }, ...envExample.slice(0, 2).map((value) => ({ type: 'file', value })),
    ]);
  } else if (docs.length) {
    results['start-path'] = verdict('pending', `${docs.join(', ')} exist but no recognisable start command was found in them`, docs.map((value) => ({ type: 'file', value })), 'write the exact commands that start the app from a clean checkout');
  } else {
    results['start-path'] = verdict('fail', 'no README.md or AGENTS.md at the project root', [], 'document how to start the app from a clean checkout');
  }

  const e2eConfigs = has(/(^|\/)(playwright|cypress)\.config\.[cm]?[jt]s$|(^|\/)\.maestro\/|(^|\/)detox\.config\./);
  if (e2eConfigs.length) {
    results['primary-flow'] = verdict('pending', `end-to-end tooling found (${e2eConfigs[0]}); which spec proves the primary flow is a human choice`, e2eConfigs.slice(0, 1).map((value) => ({ type: 'file', value })), 'name the spec that walks the primary flow and add it as evidence');
  } else {
    results['primary-flow'] = verdict('pending', 'no end-to-end tooling found; the primary flow may still be proven by a smoke script', [], 'name the command or test that proves one primary flow works');
  }

  // ── R1 ────────────────────────────────────────────────────────────────
  const buildable = ws.filter((w) => w.scripts.build);
  const buildCommands = buildable.map((w) => scriptCommand(w, 'build'));
  if (buildCommands.length) {
    results.build = verdict('pending', `build script${buildCommands.length > 1 ? 's' : ''} found`, buildCommands.map((value) => ({ type: 'command', value })), 'run with --execute to prove the build');
    results.build.commands = buildCommands;
  } else if (files.includes('Dockerfile')) {
    const command = `docker build -t ${path.basename(root).toLowerCase().replace(/[^a-z0-9_.-]/g, '-')} .`;
    results.build = verdict('pending', 'no build script, but a root Dockerfile builds the package', [{ type: 'command', value: command }], 'run with --execute to prove the image builds');
    results.build.commands = [command];
  } else if (ws.some((w) => w.markers.some((m) => /pyproject|requirements|go\.mod|Cargo|pom|gradle|csproj/.test(m)))) {
    results.build = verdict('pending', 'a non-JavaScript workspace was found; its build command is not guessable', [], 'name the build or package command for this stack');
  } else {
    results.build = verdict('fail', 'no workspace with a build script was found', [], 'add a build/compile step or name the one the stack uses');
  }

  let verifyCommand = stack.config?.verifyCommand || null;
  if (!verifyCommand) {
    const withVerify = ws.find((w) => w.scripts.verify);
    if (withVerify) verifyCommand = scriptCommand(withVerify, 'verify');
  }
  if (!verifyCommand) {
    // Stacks without package.json scripts keep their one command somewhere else.
    const make = ['Makefile', 'justfile', 'Justfile'].find((file) => files.includes(file) && /^verify\s*:/m.test(readText(path.join(root, file)) || ''));
    const script = files.find((file) => /^scripts\/verify\.(mjs|js|sh|ps1|py)$/.test(file));
    if (make) verifyCommand = make === 'Makefile' ? 'make verify' : 'just verify';
    else if (script) verifyCommand = /\.m?js$/.test(script) ? `node ${script}` : /\.py$/.test(script) ? `python ${script}` : /\.ps1$/.test(script) ? `pwsh ${script}` : `sh ${script}`;
  }
  if (verifyCommand) {
    results.verification = verdict('pending', stack.config?.verifyCommand ? 'verifyCommand is set in .claude/stack.json' : 'a verify script was found', [{ type: 'command', value: verifyCommand }], 'run with --execute to prove it passes');
    results.verification.commands = [verifyCommand];
  } else {
    results.verification = verdict('fail', 'no standard verify command (no verifyCommand in .claude/stack.json, no "verify" script)', [], 'Phase A.2: pick the one command that decides whether work is broken');
  }

  // ── R2 ────────────────────────────────────────────────────────────────
  const coverage = files.includes('docs/evidence/requirement-coverage.json') ? 'docs/evidence/requirement-coverage.json' : null;
  const requirementDocs = has(/^docs\/(requirements?|spec|specs|prd)[^/]*\.md$|^docs\/(backlog|requirements|specs)\/.+\.md$/i);
  if (coverage) {
    results['requirements-traceability'] = verdict('pending', 'a requirement coverage record exists; `buaflow requirements` decides it', [{ type: 'file', value: coverage }], 'run buaflow requirements');
  } else if (requirementDocs.length) {
    results['requirements-traceability'] = verdict('pending', `requirement documents found (${requirementDocs.length}); whether they trace to proof is a reading, not a probe`, requirementDocs.slice(0, 2).map((value) => ({ type: 'file', value })), 'confirm the important requirements point at a test or other proof');
  } else {
    results['requirements-traceability'] = verdict('fail', 'no requirement documents under docs/', [], 'record the requirements that matter and what proves each');
  }

  let testPattern = /\.(spec|test)\.[cm]?[jt]sx?$|(^|\/)(tests?|__tests__)\/.+\.(py|[jt]sx?|go|rb|php|cs)$|(^|\/)test_[^/]+\.py$|_test\.go$/;
  if (stack.config?.testFilePattern) {
    try { testPattern = new RegExp(stack.config.testFilePattern); } catch { /* keep the default */ }
  }
  const testFiles = files.filter((file) => testPattern.test(file));
  const testCommands = ws.filter((w) => w.scripts.test && !/no test specified/.test(w.scripts.test)).map((w) => scriptCommand(w, 'test'));
  if (!testFiles.length) {
    results['automated-tests'] = verdict('fail', 'no test files matched the test file pattern', [], 'add automated tests for the business path and its important failures');
  } else {
    const commands = testCommands.length ? testCommands : verifyCommand ? [verifyCommand] : [];
    results['automated-tests'] = verdict('pending', `${testFiles.length} test file${testFiles.length === 1 ? '' : 's'} found${commands.length ? '' : ', but no command runs them'}`, [
      ...commands.map((value) => ({ type: 'command', value })), { type: 'file', value: testFiles[0] },
    ], commands.length ? 'run with --execute; whether they cover the business path is a reading' : 'add a test command');
    if (commands.length) results['automated-tests'].commands = commands;
  }

  const migrations = has(/(^|\/)(prisma\/migrations|migrations|alembic\/versions|db\/migrate|drizzle)\/.+\.(sql|py|ts|js|rb)$/);
  const schemas = has(/(^|\/)schema\.prisma$|(^|\/)schema\.sql$|(^|\/)models\.py$|(^|\/)drizzle\.config\.[jt]s$/);
  if (migrations.length) {
    const parts = migrations[0].split('/');
    const dir = parts.slice(0, parts.findIndex((part) => /^(migrations|versions|migrate|drizzle)$/.test(part)) + 1).join('/');
    results.persistence = verdict('pass', `${migrations.length} migration file${migrations.length === 1 ? '' : 's'} define the persistence lifecycle`, [
      { type: 'file', value: dir || migrations[0] }, ...schemas.slice(0, 1).map((value) => ({ type: 'file', value })),
    ]);
  } else if (schemas.length) {
    results.persistence = verdict('pending', `a schema was found (${schemas[0]}) but no migrations`, [{ type: 'file', value: schemas[0] }], 'state how the schema reaches a database (migrations) or why it does not need to');
  } else {
    results.persistence = verdict('pending', 'no schema or migrations found — if the app keeps no state, that is a not-applicable a human declares with a reason', [], 'declare not-applicable with a project-specific rationale, or point at the persistence');
  }

  const authDeps = ['next-auth', '@auth/core', 'passport', 'jose', 'jsonwebtoken', 'bcrypt', 'bcryptjs', 'argon2', 'lucia', '@clerk/nextjs', 'firebase-admin', 'python-jose', 'pyjwt', 'passlib', 'fastapi-users', 'django'];
  const pythonReqs = files.filter((file) => /(^|\/)(requirements[^/]*\.txt|pyproject\.toml)$/.test(file)).map((file) => (readText(path.join(root, file)) || '').toLowerCase()).join('\n');
  const foundAuth = [...new Set(ws.flatMap((w) => Object.keys(w.dependencies)).filter((dep) => authDeps.includes(dep)).concat(authDeps.filter((dep) => pythonReqs.includes(dep))))];
  const authFiles = has(/(^|\/)(auth|authz|permissions?|rbac|middleware)(\/|\.[cm]?[jt]sx?$|\.py$)/i);
  if (foundAuth.length || authFiles.length) {
    results['access-control'] = verdict('pending', `access-control code found (${[...foundAuth.slice(0, 3), ...authFiles.slice(0, 1)].join(', ')}); R2 needs the boundary tested, which is a reading`, authFiles.slice(0, 1).map((value) => ({ type: 'file', value })), 'point at the test that proves one user cannot reach another\'s data or a forbidden role');
  } else {
    results['access-control'] = verdict('pending', 'no access-control code found — an app with no users or roles declares not-applicable with a reason', [], 'declare not-applicable with a rationale, or point at the boundary and its test');
  }

  const workflows = has(/^\.github\/workflows\/[^/]+\.ya?ml$|^\.gitlab-ci\.ya?ml$|^\.circleci\/config\.ya?ml$|^azure-pipelines\.ya?ml$|^bitbucket-pipelines\.ya?ml$/);
  // A project that is a subdirectory of its repository has its pipeline at the git root. Count a
  // workflow there only if it names this project's path — the git root of a monorepo holds
  // pipelines for its other projects too. It is named in the reason, never cited as file
  // evidence, because evidence must stay inside the project root.
  if (top.status === 0 && path.resolve(top.stdout) !== path.resolve(root)) {
    const relative = path.relative(top.stdout, root).replace(/\\/g, '/');
    const dir = path.join(top.stdout, '.github', 'workflows');
    let names = [];
    try { names = fs.readdirSync(dir).filter((name) => /\.ya?ml$/.test(name)); } catch { /* none */ }
    for (const name of names) {
      if ((readText(path.join(dir, name)) || '').includes(relative)) workflows.push(`<git root>/.github/workflows/${name}`);
    }
  }
  const ciRuns = has(/(^|\/)ci-run\.json$/).filter((file) => {
    const record = readJson(path.join(root, file));
    return record && /success|pass/i.test(String(record.conclusion || record.status || record.outcome || ''));
  });
  const localFiles = (list) => list.filter((file) => !file.startsWith('<git root>')).map((value) => ({ type: 'file', value }));
  // A clean-checkout run recorded by `buaflow ci` answers what R2 actually asks — the gate ran
  // from a fresh clone and someone can check which commit — without a hosted runner. It is named
  // as local in the reason, because it does not prove that a second machine agrees.
  const localRun = ciRuns.find((file) => readJson(path.join(root, file))?.provider === 'local-clean-checkout');
  if (localRun) {
    const record = readJson(path.join(root, localRun));
    const behind = commit && record.commit && record.commit !== commit ? `; it graded ${record.commit.slice(0, 12)}, not HEAD` : '';
    results.ci = verdict('pass', `a local clean-checkout run passed (${localRun}, ${record.durationSeconds}s)${behind}`, [{ type: 'file', value: localRun }]);
  } else if (stack.config?.ciMode === 'local-only') {
    results.ci = verdict('fail', '.claude/stack.json declares ciMode "local-only" and no clean-checkout run is recorded', localFiles(workflows).slice(0, 1), 'run `buaflow ci` to run the gate from a clean checkout and record it');
  } else if (ciRuns.length && workflows.length) {
    results.ci = verdict('pass', `${workflows[0]} has a recorded successful run (${ciRuns[0]})`, [...localFiles(workflows).slice(0, 1), { type: 'file', value: ciRuns[0] }]);
  } else if (workflows.length) {
    results.ci = verdict('pending', `CI configuration found (${workflows[0]}) but no recorded run — a workflow that never ran proves nothing`, localFiles(workflows).slice(0, 1), 'record a successful run (e.g. evidence/ci-run.json)');
  } else {
    results.ci = verdict('fail', 'no CI configuration found', [], 'add a pipeline that runs the gate from a clean checkout');
  }

  // ── R3 — presence probes only. None of these can be proven by finding a file, so the best a
  // probe can say is "a candidate exists" (pending) or "nothing was found" (fail).
  const candidate = (control, regexes, what, next) => {
    const hits = regexes.flatMap((regex) => has(regex)).filter((file, index, all) => all.indexOf(file) === index && nonEmpty(root, file));
    results[control] = hits.length
      ? verdict('pending', `candidate found (${hits[0]})`, [{ type: 'file', value: hits[0] }], next)
      : verdict('fail', `no ${what} found`, [], next);
  };
  candidate('deployment-package', [/(^|\/)Dockerfile$|(^|\/)Containerfile$|(^|\/)fly\.toml$|(^|\/)(k8s|helm|deploy|kubernetes)\/.+\.ya?ml$|(^|\/)app\.yaml$|(^|\/)Procfile$/], 'Dockerfile, Procfile or deployment manifest', 'prove the package builds and boots');
  candidate('runtime-config', [/(^|\/)\.env(\.[\w-]+)?\.example$|(^|\/)\.env\.sample$/], '.env.example or equivalent config contract', 'confirm every runtime value is named without opening source');
  candidate('database-migration', [/(^|\/)(prisma\/migrations|migrations|alembic\/versions|db\/migrate)\/.+/], 'migration directory', 'rehearse migrate-from-zero and record it');
  candidate('rollback', [/(^|\/)[^/]*rollback[^/]*\.(json|md)$/i], 'rollback procedure or rehearsal', 'write and rehearse the rollback procedure');
  candidate('secrets-scan', [/(^|\/)gitleaks[^/]*\.(json|toml)$|(^|\/)\.gitleaks\.toml$|(^|\/)trufflehog[^/]*$/i], 'secret-scan report or configuration', 'run a secret scanner and keep the report');
  candidate('dependency-scan', [/(^|\/)(npm|pnpm|yarn|pip)-audit[^/]*\.json$|(^|\/)dependency-scan[^/]*$/i], 'dependency-scan report', 'run the audit and keep the report');
  candidate('security-controls', [/^docs\/evidence\/security-baseline\.json$/], 'security baseline (docs/evidence/security-baseline.json)', 'map the app to a control set: buaflow security');
  candidate('end-to-end-tests', [/(^|\/)(playwright|cypress)\.config\.[cm]?[jt]s$|(^|\/)\.maestro\//], 'end-to-end test configuration', 'run end-to-end tests on a production-like boundary');
  candidate('observability', [/(^|\/)(log|logger|logging|telemetry|metrics|tracing|otel|instrumentation)(\.[cm]?[jt]s|\.py|\/index\.[jt]s)$/i], 'logging/metrics/tracing module', 'show logs, metrics or traces that diagnose a failure');
  if (results.observability.status === 'fail') {
    // A structured logger is usually a dependency, not a file named log.ts (the first trial used pino).
    const logging = ['pino', 'winston', 'bunyan', '@opentelemetry/api', '@opentelemetry/sdk-node', 'prom-client', '@sentry/node', 'structlog', 'loguru', 'opentelemetry-api', 'prometheus-client', 'sentry-sdk'];
    const found = logging.filter((dep) => ws.some((w) => dep in w.dependencies) || pythonReqs.includes(dep));
    if (found.length) {
      const manifest = ws.find((w) => found.some((dep) => dep in w.dependencies));
      results.observability = verdict('pending', `observability dependency found (${found.join(', ')})`, manifest ? [{ type: 'file', value: manifest.dir ? `${manifest.dir}/package.json` : 'package.json' }] : [], 'show logs, metrics or traces that diagnose a failure');
    }
  }
  candidate('health-check', [/(^|\/)health[^/]*\.(ts|js|py|go)$|(^|\/)health\/(route|index)\.[jt]s$/i], 'health endpoint', 'expose and test a health endpoint');
  if (results['health-check'].status === 'fail') {
    // Routes are usually registered inside a larger file, so look inside source — capped, so a
    // huge repository costs a bounded read rather than a full scan.
    const route = /["'`]\/(api\/)?(health|healthz|livez|readyz|ping)["'`]/;
    const hit = files.filter((file) => /\.(ts|js|mjs|py|go|rb|php|cs)$/.test(file) && !testPattern.test(file)).slice(0, 5000)
      .find((file) => { try { return fs.statSync(path.join(root, file)).size < 262144 && route.test(readText(path.join(root, file)) || ''); } catch { return false; } });
    if (hit) results['health-check'] = verdict('pending', `health route registered in ${hit}`, [{ type: 'file', value: hit }], 'expose and test a health endpoint');
  }
  candidate('performance', [/^docs\/evidence\/budgets\.json$|(^|\/)performance[^/]*\.json$/i], 'performance budget evidence', 'measure against the profile budget: buaflow budgets');
  candidate('accessibility', [/(^|\/)axe[^/]*\.json$|^docs\/evidence\/budgets\.json$/i], 'accessibility evidence', 'measure against the profile budget, or declare not-applicable with a reason');
  candidate('sbom', [/(^|\/)[^/]*\.cdx\.json$|(^|\/)sbom[^/]*\.json$|(^|\/)[^/]*\.spdx(\.json)?$/i], 'SBOM', 'generate a CycloneDX or SPDX SBOM');
  candidate('runbook', [/(^|\/)runbook[^/]*\.md$/i, /^docs\/(operations|ops)[^/]*\.md$/i], 'runbook', 'write the runbook a platform team would use at 2am');
  candidate('clean-environment', [/(^|\/)clean-environment[^/]*\.json$/i], 'clean-environment rehearsal record', 'rehearse a deploy from nothing and record it');

  for (const control of CONTROLS_BY_LEVEL.R4) {
    results[control] = verdict('pending', 'R4 requires a named compliance pack; nothing here can assess it', [], 'choose the control pack first');
  }

  return { files: files.length, workspaces: ws.map((w) => w.dir || '.'), commit, results, notes, stackConfig: stack.present };
}

function execute(root, results, options = {}) {
  const runner = options.runner || defaultRunner;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const cache = new Map();
  for (const control of ['build', 'verification', 'automated-tests']) {
    const entry = results[control];
    if (!entry?.commands?.length || entry.status !== 'pending') continue;
    const outcomes = entry.commands.map((command) => {
      if (!cache.has(command)) cache.set(command, runner(command, { cwd: root, timeoutMs }));
      return { command, ...cache.get(command) };
    });
    const failed = outcomes.find((o) => o.status !== 0);
    entry.basis = 'executed';
    if (failed) {
      entry.status = 'fail';
      entry.reason = failed.timedOut ? `\`${failed.command}\` did not finish in ${Math.round(timeoutMs / 1000)}s` : `\`${failed.command}\` exited ${failed.status}${failed.tail ? `: ${failed.tail}` : ''}`;
    } else if (control === 'automated-tests') {
      // The tests ran green. Whether they cover the business path is still a reading, so the
      // control stays pending — only the "do they run" half was proven here.
      entry.reason = `${entry.reason}; ${outcomes.map((o) => `\`${o.command}\``).join(', ')} exited 0 — coverage of the business path is still a reading`;
    } else {
      entry.status = 'pass';
      entry.reason = `${outcomes.map((o) => `\`${o.command}\``).join(', ')} exited 0`;
    }
  }
}

function summarize(results) {
  const levels = LEVEL_ORDER.map((level) => {
    const controls = CONTROLS_BY_LEVEL[level];
    const count = (status) => controls.filter((c) => results[c]?.status === status).length;
    return { level, pass: count('pass'), pending: count('pending'), fail: count('fail'), total: controls.length };
  });
  let proven = null;
  let reachable = null;
  for (const entry of levels) {
    if (entry.level === 'R4') break; // never inferred: R4 needs a named pack
    if (reachable === (LEVEL_ORDER[LEVEL_ORDER.indexOf(entry.level) - 1] || null) && entry.fail === 0) reachable = entry.level;
    if (proven === (LEVEL_ORDER[LEVEL_ORDER.indexOf(entry.level) - 1] || null) && entry.pass === entry.total) proven = entry.level;
  }
  // R4 is never a "next" the probes can speak to: it needs a named compliance pack first.
  const nextLevel = reachable === 'R3' ? null : LEVEL_ORDER[reachable ? LEVEL_ORDER.indexOf(reachable) + 1 : 0];
  const blockers = nextLevel
    ? CONTROLS_BY_LEVEL[nextLevel].filter((c) => results[c]?.status === 'fail').map((c) => ({ control: c, reason: results[c].reason, next: results[c].next }))
    : [];
  return { levels, proven, reachable, nextLevel, blockers };
}

function assess(root, options = {}) {
  const resolved = path.resolve(root);
  const probed = probe(resolved, options);
  if (options.execute) execute(resolved, probed.results, options);
  return { root: resolved, generatedAt: (options.now || new Date()).toISOString(), executed: !!options.execute, ...probed, summary: summarize(probed.results) };
}

// A draft manifest in the readiness-manifest 1.0 format. Its statuses are the assessment's,
// pending included, so readiness.js fails it honestly until a human closes the gaps.
function draftManifest(report, options = {}) {
  const target = options.level || report.summary.nextLevel || report.summary.reachable || 'R0';
  const controls = {};
  for (const control of controlsFor(target)) {
    const entry = report.results[control];
    controls[control] = {
      status: entry.status,
      evidence: entry.evidence,
      rationale: `buaflow assess (${entry.basis}): ${entry.reason}${entry.next && entry.status !== 'pass' ? ` — next: ${entry.next}` : ''}`,
    };
  }
  return {
    $comment: 'Draft written by buaflow assess. Statuses come from probes of the repository; pending means a human must decide or run something. readiness.js fails this file until every control is pass or an allowed not-applicable.',
    schemaVersion: '1.0',
    project: options.project || path.basename(report.root),
    profile: options.profile || 'unassessed',
    targetLevel: target,
    commit: report.commit || 'UNCOMMITTED',
    generatedAt: report.generatedAt,
    controls,
  };
}

function parseArgs(argv) {
  const options = { root: process.cwd(), json: false, execute: false, write: null, level: null, force: false, profile: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--root') options.root = argv[++index];
    else if (arg === '--json') options.json = true;
    else if (arg === '--execute') options.execute = true;
    else if (arg === '--write') options.write = argv[++index];
    else if (arg === '--level') options.level = argv[++index];
    else if (arg === '--profile') options.profile = argv[++index];
    else if (arg === '--force') options.force = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.root) throw new Error('--root requires a path');
  if (options.write === undefined) throw new Error('--write requires a path');
  if (options.level && !LEVEL_ORDER.includes(options.level)) throw new Error(`unsupported level: ${options.level}`);
  return options;
}

function render(report) {
  const lines = [];
  const { summary } = report;
  lines.push(`assess: proven ${summary.proven || 'none'} · reachable ${summary.reachable || 'none'}${summary.nextLevel ? ` · next ${summary.nextLevel}` : ''}${report.executed ? '' : '  (probes only — add --execute to run build/verify/tests)'}`);
  for (const note of report.notes) lines.push(`  note: ${note}`);
  for (const level of summary.levels) {
    if (level.level === 'R4') continue;
    lines.push(`  ${level.level}  pass ${level.pass}/${level.total}  pending ${level.pending}  fail ${level.fail}`);
    for (const control of CONTROLS_BY_LEVEL[level.level]) {
      const entry = report.results[control];
      lines.push(`      ${entry.status.padEnd(7)} ${control} — ${entry.reason}`);
    }
  }
  if (summary.blockers.length) {
    lines.push(`  blocking ${summary.nextLevel}:`);
    for (const blocker of summary.blockers) lines.push(`    - ${blocker.control}: ${blocker.next || blocker.reason}`);
  }
  return lines.join('\n');
}

function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(argv); } catch (error) {
    console.error(`assess: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node assess.js [--root path] [--execute] [--write draft.json [--level R0-R3] [--profile id] [--force]] [--json]');
    return 0;
  }
  const root = path.resolve(options.root);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error('assess: --root must be an existing directory');
    return 2;
  }
  const report = assess(root, { execute: options.execute });
  if (options.write) {
    const target = path.resolve(root, options.write);
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      console.error('assess: --write must stay inside the project root');
      return 2;
    }
    if (fs.existsSync(target) && !options.force) {
      console.error(`assess: refusing to overwrite ${relative}; review it or pass --force`);
      return 2;
    }
    const draft = draftManifest(report, { level: options.level, profile: options.profile });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(draft, null, 2)}\n`);
    const check = validateManifest(draft, { root });
    report.draft = { file: relative.replace(/\\/g, '/'), level: draft.targetLevel, readiness: check.outcome, errors: check.errors.length };
  }
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(render(report));
    if (report.draft) console.log(`  draft: ${report.draft.file} (${report.draft.level}) — readiness.js says ${report.draft.readiness.toUpperCase()} with ${report.draft.errors} open item(s)`);
  }
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { assess, draftManifest, execute, parseArgs, probe, render, summarize, workspaces };
