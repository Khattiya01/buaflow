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

function usage() {
  return [
    'Usage: buaflow <command> [options]',
    '',
    'Commands:',
    '  init          create .buaflow/project.json without touching source code',
    '  doctor        inspect local prerequisites and installed Buaflow controls',
    '  verify        run the project standard verification command',
    '  readiness     validate an R0-R4 evidence manifest',
    '  audit         re-check that manifest independently, from artifacts and command output',
    '  requirements  check that every requirement has proof or an unexpired approved exception',
    '  security      check the threat boundaries and the external control-set mapping',
    '  resume        summarize persisted project state for any human or AI tool',
    '',
    'audit options: --execute  re-run the declared command evidence (same trust level as the',
    '                          project\'s own scripts; without it commands stay unverified)',
    '',
    'Shared options: --root <path>  --json  --help',
    'Exit codes: 0 success, 1 failed check, 2 invalid input, 3 unavailable tool',
  ].join('\n');
}

function parse(argv) {
  if (argv[0] === '--help' || argv[0] === '-h') return { command: 'help', options: { root: process.cwd(), json: false, help: true, force: false, strict: false, mode: 'new', level: null, file: null, execute: false } };
  const [command, ...rest] = argv;
  const options = { root: process.cwd(), json: false, help: false, force: false, strict: false, mode: 'new', level: null, file: null, execute: false };
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];
    if (arg === '--root') options.root = rest[++index];
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--execute') options.execute = true;
    else if (arg === '--mode') options.mode = rest[++index];
    else if (arg === '--level') options.level = rest[++index];
    else if (arg === '--file') options.file = rest[++index];
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

  const manifestFile = path.join(root, '.buaflow', 'project.json');
  if (!fs.existsSync(manifestFile)) warning('project-manifest', 'missing .buaflow/project.json; run buaflow init');
  else {
    try {
      const manifest = readJson(manifestFile);
      manifest.schemaVersion === '1.0' ? pass('project-manifest', manifest.track || 'v1') : fail('project-manifest', `unsupported schemaVersion ${manifest.schemaVersion}`);
    } catch (error) { fail('project-manifest', `invalid JSON: ${error.message}`); }
  }

  const claude = path.join(root, '.claude');
  const controls = ['verify.js', 'readiness.js', 'verifier.js', 'requirement-coverage.js', 'security-baseline.js', 'gate.js', 'check-config.js'];
  const installed = controls.filter((name) => fs.existsSync(path.join(claude, name)));
  installed.length ? pass('controls', `${installed.length}/${controls.length} core controls installed`) : warning('controls', 'no .claude controls installed yet; this is normal before Phase 7');
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
        : command === 'security' ? 'security-baseline.js'
        : 'readiness.js';
  const script = path.join(root, '.claude', scriptName);
  if (!fs.existsSync(script)) {
    return envelope(command, EXIT.UNAVAILABLE, `${scriptName} is not installed in this project`, { expected: '.claude/' + scriptName }, [], [`install Buaflow controls in Phase 7 before running ${command}`]);
  }
  const args = command === 'security'
    ? ['--root', root, '--file', options.file || 'docs/evidence/security-baseline.json', '--json']
    : command === 'requirements'
    ? ['--root', root, '--file', options.file || 'docs/evidence/requirement-coverage.json', '--json']
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
  const emitsJson = command === 'readiness' || command === 'audit' || command === 'requirements' || command === 'security';
  if (emitsJson && result.stdout.trim()) {
    try { childJson = JSON.parse(result.stdout); } catch { /* output is retained below for diagnosis */ }
  }
  return envelope(command, code, code === EXIT.OK ? `${command} passed` : `${command} failed`, {
    delegatedTo: `.claude/${scriptName}`,
    result: childJson,
    output: emitsJson && childJson ? undefined : result.stdout.trim(),
  }, [], result.status === 0 ? [] : [result.stderr.trim() || result.stdout.trim() || `${scriptName} exited ${result.status}`]);
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
  if (!['init', 'doctor', 'verify', 'readiness', 'audit', 'requirements', 'security', 'resume'].includes(command)) {
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
        : commandDelegated(command, options.root, options);
  emit(result, options.json);
  return result.code;
}

if (require.main === module) process.exit(main());

module.exports = { EXIT, commandDoctor, commandInit, commandResume, main, parse };
