#!/usr/bin/env node
'use strict';

/**
 * Vendor-neutral Buaflow command shell.
 *
 * Run from an adopter project (where buaflow/ is a subdirectory):
 *   node buaflow/bin/buaflow.js init --mode new
 *   node buaflow/bin/buaflow.js doctor --json
 *
 * Exit codes: 0 success, 1 checks/command failed, 2 invalid input, 3 required tool unavailable.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const KIT_ROOT = path.resolve(__dirname, '..');
const PACKAGE = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'package.json'), 'utf8'));
const EXIT = Object.freeze({ OK: 0, FAILED: 1, INPUT: 2, UNAVAILABLE: 3 });
const COMMANDS = Object.freeze(['init', 'doctor', 'intake', 'assess', 'ci', 'benchmark', 'verify', 'readiness', 'audit', 'requirements', 'assumptions', 'security', 'supply', 'operations', 'budgets', 'evals', 'changes', 'install', 'lock', 'resume', 'usage']);

function usage() {
  return [
    'Usage: buaflow <command> [options]',
    '',
    'Commands:',
    '  init          create .buaflow/project.json without touching source code',
    '  doctor        inspect local prerequisites and installed Buaflow controls',
    '  intake        turn an issue-tracker export, a CSV or a plain list into draft intents (--file, --write)',
    '  assess        answer "which readiness level is this project at" from the repository itself,',
    '                without a manifest and before any control is installed',
    '  ci            run the gate from a clean checkout on this machine and record it (no hosted CI needed)',
    '  benchmark     score functional, engineering and operations from existing evidence (EV-002)',
    '  verify        run the project standard verification command',
    '  readiness     validate an R0-R4 evidence manifest',
    '  audit         re-check that manifest independently, from artifacts and command output',
    '  requirements  check that every requirement has proof or an unexpired approved exception',
    '  assumptions   check that every guess has an owner, an expiry and a way to be checked (IC-004)',
    '  security      check the threat boundaries and the external control-set mapping',
    '  supply        check dependency licences, build provenance and artifact checksums',
    '  operations    check the restore rehearsal and the incident-hook contract',
    '  budgets       check measured performance and accessibility against the profile ceilings',
    '  evals         check eval cases and the runs that claim to have passed them',
    '  changes       check that each AI-config change names its evidence and was kept or rolled back on eval results (EV-006)',
    '  install       copy the gate, checkers and project seeds into .claude/ (--plugin, --write, --force)',
  '  lock          record which kit version and files are installed, or report files changed since (--write)',
    '  resume        summarize persisted project state for any human or AI tool',
    '  usage         internal opt-in usage capture (EV-011): consent --enable|--disable, status,',
    '                record check --task <id> --verdict pass|fail [--findings <file|->] [--level <l>],',
    '                setup --store <path to your clone> [--machine <id>], sync',
    '',
    'assess options: --execute  also run the build/verify/test commands it finds',
    '                --write <path>  write a draft readiness manifest (never overwrites without --force)',
    '',
    'audit options: --execute  re-run the declared command evidence (same trust level as the',
    '                          project\'s own scripts; without it commands stay unverified)',
    '',
    'Shared options: --root <path>  --json  --help',
    'Exit codes: 0 success, 1 failed check, 2 invalid input, 3 unavailable tool',
  ].join('\n');
}

function parse(argv) {
  if (argv[0] === '--help' || argv[0] === '-h') return { command: 'help', options: { root: process.cwd(), json: false, help: true, force: false, strict: false, mode: 'new', level: null, file: null, execute: false, write: null, plugin: false } };
  const [command, ...rest] = argv;
  const options = { root: process.cwd(), json: false, help: false, force: false, strict: false, mode: 'new', level: null, file: null, execute: false, write: null, plugin: false, args: [] };
  // usage has its own subcommands and flags; claude-setup/usage.js validates them
  if (command === 'usage') {
    for (let index = 0; index < rest.length; index++) {
      const arg = rest[index];
      if (arg === '--root') options.root = rest[++index];
      else if (arg === '--json') options.json = true;
      else if (arg === '--help' || arg === '-h') options.help = true;
      else options.args.push(arg);
    }
    if (!options.root) throw new Error('--root requires a path');
    options.root = path.resolve(options.root);
    return { command, options };
  }
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];
    if (arg === '--root') options.root = rest[++index];
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--execute') options.execute = true;
    else if (arg === '--plugin') options.plugin = true;
    else if (arg === '--mode') options.mode = rest[++index];
    else if (arg === '--level') options.level = rest[++index];
    else if (arg === '--file') options.file = rest[++index];
    // --write is a path for assess and a plain flag for lock/intake: take a value only when one follows
    else if (arg === '--write') options.write = rest[index + 1] && !rest[index + 1].startsWith('--') ? rest[++index] : true;
    else throw new Error(`unknown option: ${arg}`);
  }
  if (!command && !options.help) throw new Error('command is required');
  if (options.mode && !['new', 'extend'].includes(options.mode)) throw new Error('--mode must be new or extend');
  if (options.level && !['R0', 'R1', 'R2', 'R3', 'R4'].includes(options.level)) throw new Error('--level must be R0, R1, R2, R3 or R4');
  if (!options.root) throw new Error('--root requires a path');
  options.root = path.resolve(options.root);
  return { command, options };
}

function envelope(command, code, summary, data = {}, warnings = [], errors = []) {
  return {
    schemaVersion: '1.0',
    command,
    status: code === EXIT.OK ? 'ok' : 'error',
    code,
    summary,
    data,
    warnings,
    errors,
  };
}

function emit(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  console.log(`buaflow ${result.command}: ${result.status.toUpperCase()} — ${result.summary}`);
  for (const warning of result.warnings || []) console.log(`  warn: ${warning}`);
  for (const error of result.errors || []) console.log(`  fail: ${error}`);
  for (const [key, value] of Object.entries(result.data || {})) {
    if (value === null || value === undefined || typeof value === 'object') continue;
    console.log(`  ${key}: ${value}`);
  }
  // assess and benchmark are read by people first: their per-control table is the answer, the
  // summary line alone is not. JSON consumers get the same content as data.result.
  if (result.text) console.log(`
${result.text}`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function within(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function runNode(root, script, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function commandInit(root, options) {
  const file = path.join(root, '.buaflow', 'project.json');
  if (fs.existsSync(file) && !options.force) {
    return envelope('init', EXIT.FAILED, 'project manifest already exists; use --force only after reviewing it', { file: path.relative(root, file) }, [], ['refusing to overwrite .buaflow/project.json']);
  }
  const packageFile = path.join(root, 'package.json');
  let project = path.basename(root);
  try { project = readJson(packageFile).name || project; } catch { /* package.json is optional */ }
  const manifest = {
    $schema: '../buaflow/schemas/project-manifest.schema.json',
    schemaVersion: '1.0',
    project,
    track: options.mode,
    assuranceMode: 'adoption',
    createdAt: new Date().toISOString(),
    buaflowVersion: PACKAGE.version,
    planningState: 'docs/planning/_state.md',
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return envelope('init', EXIT.OK, 'created vendor-neutral project manifest; source code and AI-tool configuration were not changed', {
    file: path.relative(root, file),
    track: manifest.track,
    next: options.mode === 'extend' ? 'Run buaflow doctor, then follow Phase A adoption.' : 'Run buaflow doctor, then follow Phase 0 discovery.',
  });
}

function commandDoctor(root, options) {
  const checks = [];
  const warning = (name, detail) => checks.push({ name, status: 'warn', detail });
  const pass = (name, detail) => checks.push({ name, status: 'pass', detail });
  const fail = (name, detail) => checks.push({ name, status: 'fail', detail });

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  nodeMajor >= 22 ? pass('node', process.version) : fail('node', `Node ${process.version} is below the supported major 22`);
  const git = spawnSync('git', ['--version'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git.status === 0 ? pass('git', git.stdout.trim()) : warning('git', 'Git is unavailable; initialize/source-control before Phase 6');
  // EV-009 K-1: "git exists on this machine" is not "this project is in version control". The
  // version-control control needs a commit identity, and hooks/CI install at the git root —
  // pointed at frontend/ of a monorepo, doctor used to say nothing at all.
  if (git.status === 0) {
    const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (top.status !== 0) warning('repository', 'this root is not inside a git work tree; readiness cannot bind evidence to a commit');
    else if (path.resolve(top.stdout.trim()) !== path.resolve(root)) {
      // A monorepo subdirectory is a valid layout (the kit's own reference apps are one), so this
      // is said, not warned — a warning would fail --strict for a setup that is not wrong.
      pass('repository', `this root is a subdirectory of the git repository at ${top.stdout.trim()}; hooks and CI install at the git root, and every path in .claude/stack.json is relative to this root`);
    } else pass('repository', 'project root is the git root');
  }

  const manifestFile = path.join(root, '.buaflow', 'project.json');
  if (!fs.existsSync(manifestFile)) warning('project-manifest', 'missing .buaflow/project.json; run buaflow init');
  else {
    try {
      const manifest = readJson(manifestFile);
      manifest.schemaVersion === '1.0' ? pass('project-manifest', manifest.track || 'v1') : fail('project-manifest', `unsupported schemaVersion ${manifest.schemaVersion}`);
    } catch (error) { fail('project-manifest', `invalid JSON: ${error.message}`); }
  }

  const claude = path.join(root, '.claude');
  const controls = ['verify.js', 'readiness.js', 'verifier.js', 'requirement-coverage.js', 'assumption-ledger.js', 'security-baseline.js', 'supply-chain.js', 'operational-readiness.js', 'budgets.js', 'eval-harness.js', 'change-proposal.js', 'gate.js', 'check-config.js'];
  const installed = controls.filter((name) => fs.existsSync(path.join(claude, name)));
  let settings = null;
  try { settings = readJson(path.join(claude, 'settings.json')); } catch { /* no settings yet */ }
  const pluginMode = settings?.enabledPlugins?.['buaflow@buaflow'] === true;
  if (installed.length) pass('controls', `${installed.length}/${controls.length} core controls installed`);
  // PE-008: the plugin gives a session its skills and hooks, which can look like "Buaflow is set up"
  // while nothing guards a push made outside that session.
  else if (pluginMode) warning('controls', 'the Buaflow plugin is enabled here but the gate and checkers are not installed — pre-push and CI have nothing to run; run buaflow install --plugin --write');
  else warning('controls', 'no .claude controls installed yet; this is normal before Phase 7 (buaflow install puts them in)');
  if (pluginMode && /\.claude\/hooks\/(guard-bash|guard-edit|session-context|format-changed|guard-new-component|usage-capture)\.js/.test(JSON.stringify(settings.hooks || {}))) {
    warning('hooks', 'the Buaflow plugin is enabled and .claude/settings.json also wires the same hooks from .claude/hooks/ — every hook runs twice; remove those entries from "hooks"');
  }
  if (installed.length) {
    // PE-002: an installed kit with no lock cannot tell an upgradeable file from one somebody changed.
    const lock = runNode(root, path.join(KIT_ROOT, 'claude-setup', 'kit-lock.js'), ['--root', root, '--json']);
    let report = null;
    try { report = JSON.parse(lock.stdout); } catch { /* no report */ }
    if (!report || report.error) warning('kit-lock', 'no .buaflow/lock.json — run buaflow lock --write so later upgrades can tell your changes from the kit\'s');
    else if (report.counts.drifted) warning('kit-lock', `${report.counts.drifted} installed file(s) changed since the lock without being accepted — run buaflow lock`);
    else pass('kit-lock', `locked at ${report.lockedVersion}: ${report.counts.outdated} outdated, ${report.counts.customized} customized`);
  }
  if (fs.existsSync(path.join(root, 'docs', 'planning', '_state.md'))) pass('planning-state', 'docs/planning/_state.md found');
  else warning('planning-state', 'missing docs/planning/_state.md; start or resume the lifecycle before implementation');

  const failures = checks.filter((item) => item.status === 'fail');
  const warnings = checks.filter((item) => item.status === 'warn').map((item) => `${item.name}: ${item.detail}`);
  const errors = failures.map((item) => `${item.name}: ${item.detail}`);
  const code = failures.length || (options.strict && warnings.length) ? EXIT.FAILED : EXIT.OK;
  return envelope('doctor', code, failures.length ? 'environment has blocking issues' : warnings.length ? 'environment is usable with setup gaps' : 'environment is ready', { checks }, warnings, errors);
}

function commandDelegated(command, root, options) {
  const scriptName = command === 'verify' ? 'verify.js'
    : command === 'audit' ? 'verifier.js'
      : command === 'requirements' ? 'requirement-coverage.js'
        : command === 'assumptions' ? 'assumption-ledger.js'
        : command === 'security' ? 'security-baseline.js'
          : command === 'supply' ? 'supply-chain.js'
            : command === 'operations' ? 'operational-readiness.js'
              : command === 'budgets' ? 'budgets.js'
                : command === 'evals' ? 'eval-harness.js'
                  : command === 'changes' ? 'change-proposal.js'
        : 'readiness.js';
  const script = path.join(root, '.claude', scriptName);
  if (!fs.existsSync(script)) {
    return envelope(command, EXIT.UNAVAILABLE, `${scriptName} is not installed in this project`, { expected: '.claude/' + scriptName }, [], [`install Buaflow controls in Phase 7 before running ${command}`]);
  }
  const args = command === 'evals'
    // เคสอยู่ที่ docs/evals/ · run อยู่ใน runs/ และตรวจเฉพาะเมื่อมีจริง เพราะโปรเจกต์ที่ยัง
    // ไม่มีใครมาตรวจ eval ให้ ควรมี baseline ที่ยังไม่ถูกรันได้โดยไม่ถูกนับเป็นความล้มเหลว
    ? ['--cases', options.file || 'docs/evals',
       ...(fs.existsSync(path.join(root, 'docs', 'evals', 'runs')) ? ['--runs', 'docs/evals/runs'] : []),
       '--root', root, '--json']
    : command === 'changes'
    ? ['--dir', options.file || 'docs/evidence/changes', '--root', root, '--json']
    : command === 'budgets'
    ? ['--root', root, '--file', options.file || 'docs/evidence/budgets.json', '--json']
    : command === 'operations'
    ? ['--root', root, '--file', options.file || 'docs/evidence/operational-readiness.json', '--json']
    : command === 'supply'
    ? ['--root', root, '--file', options.file || 'docs/evidence/supply-chain.json', '--json']
    : command === 'security'
    ? ['--root', root, '--file', options.file || 'docs/evidence/security-baseline.json', '--json']
    : command === 'requirements'
    ? ['--root', root, '--file', options.file || 'docs/evidence/requirement-coverage.json', '--json']
    : command === 'assumptions'
    ? ['--root', root, '--file', options.file || 'docs/evidence/assumptions.json', '--json']
    : command === 'readiness'
    ? ['--file', options.file || 'docs/evidence/readiness.json', ...(options.level ? ['--level', options.level] : []), '--json']
    : command === 'audit'
      ? [
        '--root', root,
        '--file', options.file || 'docs/evidence/readiness.json',
        ...(options.level ? ['--level', options.level] : []),
        ...(options.execute ? ['--execute'] : []),
        '--json',
      ]
      : [];
  const result = runNode(root, script, args);
  const code = result.status === 0 ? EXIT.OK : EXIT.FAILED;
  let childJson = null;
  const emitsJson = command === 'readiness' || command === 'audit' || command === 'requirements' || command === 'assumptions' || command === 'security' || command === 'supply' || command === 'operations' || command === 'budgets' || command === 'evals' || command === 'changes';
  if (emitsJson && result.stdout.trim()) {
    try { childJson = JSON.parse(result.stdout); } catch { /* output is retained below for diagnosis */ }
  }
  return envelope(command, code, code === EXIT.OK ? `${command} passed` : `${command} failed`, {
    delegatedTo: `.claude/${scriptName}`,
    result: childJson,
    output: emitsJson && childJson ? undefined : result.stdout.trim(),
  }, [], result.status === 0 ? [] : [result.stderr.trim() || result.stdout.trim() || `${scriptName} exited ${result.status}`]);
}

// EV-009 K-2: the first question of anyone adopting an existing project is "where am I", and
// readiness can only answer it once somebody has written the answer down. assess runs the KIT's
// copy of the script, not the project's .claude/ copy, because it is meant for the first minute
// of adoption — before Phase 7 has installed anything.
function commandAssess(root, options) {
  const args = ['--root', root, '--json'];
  if (options.execute) args.push('--execute');
  if (options.write === true) return envelope('assess', EXIT.INPUT, 'nowhere to write', {}, [], ['assess --write needs a path, e.g. --write docs/evidence/readiness.draft.json']);
  if (options.write) args.push('--write', options.write);
  if (options.level) args.push('--level', options.level);
  if (options.force) args.push('--force');
  const result = runNode(root, path.join(KIT_ROOT, 'claude-setup', 'assess.js'), args);
  if (result.status !== 0) {
    return envelope('assess', result.status === 2 ? EXIT.INPUT : EXIT.FAILED, 'assessment could not run', {}, [], [result.stderr.trim() || `assess.js exited ${result.status}`]);
  }
  const report = JSON.parse(result.stdout);
  const { proven, reachable, nextLevel, blockers } = report.summary;
  const out = envelope('assess', EXIT.OK, `proven ${proven || 'none'}, reachable ${reachable || 'none'}${nextLevel ? `, next ${nextLevel}` : ''}`, {
    proven: proven || 'none',
    reachable: reachable || 'none',
    blocking: blockers.map((b) => b.control).join(', ') || undefined,
    draft: report.draft?.file,
    result: report,
  }, report.notes);
  Object.defineProperty(out, 'text', { value: require(path.join(KIT_ROOT, 'claude-setup', 'assess.js')).render(report), enumerable: false });
  return out;
}

// EV-002: the Production-Qualified App benchmark. Like assess it runs the KIT's copy, so a
// project Buaflow did not produce can be scored with the same command as its own apps.
function commandBenchmark(root) {
  const result = runNode(root, path.join(KIT_ROOT, 'claude-setup', 'benchmark.js'), ['--root', root, '--json']);
  if (result.status !== 0) {
    return envelope('benchmark', result.status === 2 ? EXIT.INPUT : EXIT.FAILED, 'benchmark could not run', {}, [], [result.stderr.trim() || `benchmark.js exited ${result.status}`]);
  }
  const report = JSON.parse(result.stdout);
  const d = report.dimensions;
  const out = envelope('benchmark', EXIT.OK, `functional ${d.functional.score.toFixed(2)} · engineering ${d.engineering.score.toFixed(2)} · operations ${d.operations.score.toFixed(2)} · ${report.qualified ? 'production-qualified' : 'not production-qualified'}`, {
    overall: report.overall,
    qualified: report.qualified,
    result: report,
  }, report.reasons);
  Object.defineProperty(out, 'text', { value: require(path.join(KIT_ROOT, 'claude-setup', 'benchmark.js')).render([report]), enumerable: false });
  return out;
}

// EV-009: R2 needs CI from a clean checkout, and hosted CI can be unavailable for reasons that
// have nothing to do with the project (the first trial: account billing). Runs the KIT's copy so it
// also works where .claude/ predates this command; the gate itself is the checkout's own.
function commandCi(root) {
  const result = runNode(root, path.join(KIT_ROOT, 'claude-setup', 'local-ci.js'), ['--root', root, '--json']);
  if (result.status === 2) return envelope('ci', EXIT.INPUT, 'local CI could not start', {}, [], [result.stderr.trim()]);
  let record = null;
  try { record = JSON.parse(result.stdout); } catch { /* reported below */ }
  if (!record) return envelope('ci', EXIT.FAILED, 'local CI produced no record', {}, [], [result.stderr.trim() || `local-ci.js exited ${result.status}`]);
  const failed = record.steps.find((s) => s.exitCode !== 0);
  return envelope('ci', result.status === 0 ? EXIT.OK : EXIT.FAILED, `${record.conclusion} on a clean checkout of ${record.commit.slice(0, 12)} in ${record.durationSeconds}s`, {
    record: 'docs/evidence/ci-run.json',
    conclusion: record.conclusion,
    result: record,
  }, record.uncommittedChangesNotIncluded ? [`${record.uncommittedChangesNotIncluded} uncommitted change(s) were not part of this run`] : [], failed ? [`${failed.name}: ${failed.outputTail.split(/\r?\n/).slice(-3).join(' | ')}`] : []);
}

// IC-003: work that already waits in another tracker enters the artifact chain as drafts.
function commandIntake(root, options) {
  if (!options.file) return envelope('intake', EXIT.INPUT, 'nothing to import', {}, [], ['--file <issues.json|backlog.csv|notes.md> is required']);
  const args = ['--root', root, '--from', options.file, '--json', ...(options.write ? ['--write'] : [])];
  const result = runNode(root, path.join(KIT_ROOT, 'claude-setup', 'intake.js'), args);
  if (result.status !== 0) return envelope('intake', result.status === 2 ? EXIT.INPUT : EXIT.FAILED, 'intake could not run', {}, [], [result.stderr.trim()]);
  const report = JSON.parse(result.stdout);
  return envelope('intake', EXIT.OK, `${report.created.length} draft intent(s) ${report.written ? 'written' : 'would be written — add --write'} · ${report.skipped.length} skipped`, { written: report.written, result: report });
}

// PE-002: which kit version a project installed, and which installed files changed since.
function commandLock(root, options) {
  const result = runNode(root, path.join(KIT_ROOT, 'claude-setup', 'kit-lock.js'), ['--root', root, '--json', ...(options.write ? ['--write'] : [])]);
  if (result.status === 2) return envelope('lock', EXIT.INPUT, 'nothing installed to lock', {}, [], [result.stderr.trim()]);
  let report = null;
  try { report = JSON.parse(result.stdout); } catch { /* reported below */ }
  if (!report) return envelope('lock', EXIT.FAILED, 'lock could not run', {}, [], [result.stderr.trim()]);
  if (report.error) return envelope('lock', EXIT.FAILED, 'no lock yet', {}, [], [report.error]);
  if (options.write) return envelope('lock', EXIT.OK, `recorded ${Object.keys(report.files).length} installed file(s) at kit ${report.kitVersion}`, { file: '.buaflow/lock.json' });
  const c = report.counts;
  return envelope('lock', c.drifted ? EXIT.FAILED : EXIT.OK, `locked at ${report.lockedVersion}, kit is ${report.kitVersion}: ${c.current} current, ${c.outdated} outdated, ${c.customized} customized, ${c.drifted} drifted`, { result: report },
    report.rows.filter((r) => r.status === 'outdated' || r.status === 'customized').map((r) => `${r.status}: ${r.file}`),
    report.rows.filter((r) => r.status === 'drifted').map((r) => `drifted (changed since the lock, nobody accepted it): ${r.file}`));
}

// PE-008: the deterministic half of Phase 7, runnable from a buaflow/ folder or from the plugin's kit.
function commandInstall(root, options) {
  const args = ['--root', root, '--json', ...(options.plugin ? ['--plugin'] : []), ...(options.write ? ['--write'] : []), ...(options.force ? ['--force'] : [])];
  const result = runNode(root, path.join(KIT_ROOT, 'claude-setup', 'install.js'), args);
  if (result.status === 2) return envelope('install', EXIT.INPUT, 'install could not start', {}, [], [result.stderr.trim()]);
  let report = null;
  try { report = JSON.parse(result.stdout); } catch { /* reported below */ }
  if (!report) return envelope('install', EXIT.FAILED, 'install could not run', {}, [], [result.stderr.trim()]);
  const c = report.counts;
  const out = envelope('install', c.conflict ? EXIT.FAILED : EXIT.OK,
    `kit ${report.kitVersion}${report.plugin ? ' with the session layer from the plugin' : ''}: ${c.create} create, ${c.update} update, ${c.unchanged} unchanged, ${c.keep} kept, ${c.conflict} conflict${report.written ? '' : ' — dry run, add --write'}`,
    { written: report.written, lock: report.written ? '.buaflow/lock.json' : undefined, result: report },
    report.warnings,
    report.entries.filter((e) => e.action === 'conflict').map((e) => `conflict: ${e.file} — ${e.reason}; merge it by hand or re-run with --force to take the kit's version`));
  // Creates are grouped by folder (a first install is ~70 files); updates are listed one by one,
  // because each is a file the project already had.
  const groups = {};
  for (const e of report.entries.filter((x) => x.action === 'create')) {
    const dir = path.posix.dirname(e.file);
    groups[dir] = (groups[dir] || 0) + 1;
  }
  const lines = [
    ...Object.entries(groups).map(([dir, n]) => `  create   ${String(n).padStart(3)} file(s) in ${dir}/`),
    ...report.entries.filter((e) => e.action === 'update').map((e) => `  update   ${e.file}${e.reason ? `  (${e.reason})` : ''}`),
  ];
  if (lines.length) Object.defineProperty(out, 'text', { value: lines.join('\n'), enumerable: false });
  return out;
}

// EV-011: in-process so the hook and the CLI share one implementation.
function commandUsage(root, options) {
  const result = require(path.join(KIT_ROOT, 'claude-setup', 'usage.js')).runCommand(root, options.args);
  return envelope('usage', result.code, result.summary, result.data, result.warnings, result.errors);
}

function commandResume(root) {
  const warnings = [];
  const data = { projectManifest: null, planning: null, inProgressTasks: [] };
  const manifestFile = path.join(root, '.buaflow', 'project.json');
  if (fs.existsSync(manifestFile)) {
    try { data.projectManifest = readJson(manifestFile); } catch (error) { return envelope('resume', EXIT.FAILED, 'project manifest is invalid', data, warnings, [error.message]); }
  } else warnings.push('missing .buaflow/project.json; run buaflow init to persist tool-neutral project metadata');

  const stateFile = path.join(root, 'docs', 'planning', '_state.md');
  if (fs.existsSync(stateFile)) {
    const text = fs.readFileSync(stateFile, 'utf8');
    data.planning = {
      file: 'docs/planning/_state.md',
      completedMarkers: (text.match(/✅/g) || []).length,
      pendingMarkers: (text.match(/⬜/g) || []).length,
    };
  } else warnings.push('missing docs/planning/_state.md');

  const tasksDirectory = path.join(root, 'docs', 'backlog', 'tasks');
  if (fs.existsSync(tasksDirectory)) {
    for (const file of fs.readdirSync(tasksDirectory).filter((name) => name.endsWith('.md'))) {
      const text = fs.readFileSync(path.join(tasksDirectory, file), 'utf8');
      if (/^status:\s*in-progress\s*$/m.test(text)) data.inProgressTasks.push(file.replace(/\.md$/, ''));
    }
  }
  if (!data.projectManifest && !data.planning) {
    return envelope('resume', EXIT.FAILED, 'no persisted Buaflow state was found', data, warnings, ['run buaflow init and begin Phase 0 or Phase A']);
  }
  return envelope('resume', EXIT.OK, 'loaded persisted state without using an AI-vendor session', data, warnings);
}

function main(argv = process.argv.slice(2)) {
  let parsed;
  try { parsed = parse(argv); } catch (error) {
    const result = envelope('cli', EXIT.INPUT, 'invalid command input', {}, [], [error.message]);
    emit(result, argv.includes('--json'));
    return EXIT.INPUT;
  }
  const { command, options } = parsed;
  if (options.help || command === 'help') {
    if (options.json) emit(envelope(command || 'help', EXIT.OK, 'command reference', { usage: usage() }), true);
    else console.log(usage());
    return EXIT.OK;
  }
  if (!COMMANDS.includes(command)) {
    const result = envelope(command || 'cli', EXIT.INPUT, 'unknown command', {}, [], [usage()]);
    emit(result, options.json);
    return EXIT.INPUT;
  }
  if (!fs.existsSync(options.root) || !fs.statSync(options.root).isDirectory()) {
    const result = envelope(command, EXIT.INPUT, 'root directory does not exist', { root: options.root }, [], ['--root must point to an existing directory']);
    emit(result, options.json);
    return EXIT.INPUT;
  }
  const result = command === 'init' ? commandInit(options.root, options)
    : command === 'doctor' ? commandDoctor(options.root, options)
      : command === 'resume' ? commandResume(options.root)
        : command === 'lock' ? commandLock(options.root, options)
        : command === 'install' ? commandInstall(options.root, options)
        : command === 'assess' ? commandAssess(options.root, options)
          : command === 'intake' ? commandIntake(options.root, options)
          : command === 'benchmark' ? commandBenchmark(options.root)
            : command === 'ci' ? commandCi(options.root)
            : command === 'usage' ? commandUsage(options.root, options)
        : commandDelegated(command, options.root, options);
  emit(result, options.json);
  return result.code;
}

if (require.main === module) process.exit(main());

module.exports = { COMMANDS, EXIT, commandInstall, commandLock, commandAssess, commandIntake, commandBenchmark, commandCi, commandDoctor, commandInit, commandResume, commandUsage, main, parse };
