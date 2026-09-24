'use strict';

/**
 * EV-011 internal usage capture — core shared by the CLI (`buaflow usage`) and the usage-capture hook.
 * Nothing is written anywhere until the project has answered yes in .buaflow/usage.json.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { frontmatter } = require('./convergence.js');

const SCHEMA_VERSION = '1.0';
const MARKER_MAX_AGE_MS = 60 * 1000;
const TRANSCRIPT_TAIL_BYTES = 64 * 1024;
const EVENT_TYPES = Object.freeze(['intent.opened', 'plan.approved', 'task.created', 'task.status', 'task.done', 'check.result', 'verifier.audit', 'readiness.snapshot']);
const EVENT_FIELDS = Object.freeze(['schemaVersion', 'id', 'type', 'at', 'project', 'task', 'model', 'kitVersion', 'commit', 'sessionId', 'machine', 'data']);
const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const TASK_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const SECRET_PATTERNS = Object.freeze([
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /AKIA[0-9A-Z]{16}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /ghp_[A-Za-z0-9]{36}/g,
]);

const consentFile = (root) => path.join(root, '.buaflow', 'usage.json');
const usageDir = (root) => path.join(root, '.buaflow', 'usage');
const eventsDir = (root) => path.join(usageDir(root), 'events');
const stateFile = (root) => path.join(usageDir(root), 'state.json');
const markerFile = (root) => path.join(usageDir(root), 'marker.json');
const machineConfigFile = () => path.join(os.homedir(), '.buaflow', 'usage.json');

function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
  } catch {
    return null;
  }
}

// Read from .git on disk: a hook runs on every Write/Edit and spawning git costs more than the whole budget on Windows.
function headCommit(root) {
  try {
    let dir = path.join(root, '.git');
    if (fs.statSync(dir).isFile()) dir = path.resolve(root, fs.readFileSync(dir, 'utf8').match(/^gitdir:\s*(.+)$/m)[1].trim());
    let head = fs.readFileSync(path.join(dir, 'HEAD'), 'utf8').trim();
    const ref = head.match(/^ref:\s*(.+)$/)?.[1];
    if (ref) {
      // A worktree keeps HEAD in its own gitdir but refs in the common one.
      const common = fs.existsSync(path.join(dir, 'commondir')) ? path.resolve(dir, fs.readFileSync(path.join(dir, 'commondir'), 'utf8').trim()) : dir;
      const loose = path.join(common, ref);
      head = fs.existsSync(loose) ? fs.readFileSync(loose, 'utf8').trim()
        : fs.readFileSync(path.join(common, 'packed-refs'), 'utf8').split('\n').find((line) => line.endsWith(` ${ref}`))?.split(' ')[0];
    }
    if (/^[0-9a-f]{40,64}$/.test(head || '')) return head.slice(0, 7);
  } catch { /* fall through to git */ }
  return git(root, ['rev-parse', '--short=7', 'HEAD']);
}

function sanitizeName(value) {
  const name = String(value || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, 64);
  return name || 'project';
}

function defaultProject(root) {
  const remote = git(root, ['remote', 'get-url', 'origin']);
  const base = remote ? remote.replace(/\/+$/, '').split(/[/:]/).pop().replace(/\.git$/, '') : path.basename(path.resolve(root));
  return sanitizeName(base);
}

function validateConsent(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['consent must be an object'];
  const allowed = new Set(['$schema', '_', 'schemaVersion', 'enabled', 'project', 'decidedBy', 'decidedAt']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`unknown field: ${key}`);
  if (value.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  if (typeof value.enabled !== 'boolean') errors.push('enabled must be true or false');
  if (!NAME_PATTERN.test(value.project || '')) errors.push('project must match [a-z0-9._-]');
  if (typeof value.decidedBy !== 'string' || !value.decidedBy) errors.push('decidedBy is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.decidedAt || '')) errors.push('decidedAt must be YYYY-MM-DD');
  return errors;
}

// unset = never asked · invalid is treated as disabled, never as enabled
function readConsent(root) {
  const file = consentFile(root);
  if (!fs.existsSync(file)) return { state: 'unset', consent: null, errors: [] };
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { return { state: 'invalid', consent: null, errors: [error.message] }; }
  const errors = validateConsent(value);
  if (errors.length) return { state: 'invalid', consent: null, errors };
  return { state: value.enabled ? 'enabled' : 'disabled', consent: value, errors: [] };
}

function whoAmI(root) {
  return git(root, ['config', 'user.name']) || git(root, ['config', 'user.email']) || os.userInfo().username;
}

function writeConsent(root, { enabled, project, decidedBy, now = new Date() }) {
  const previous = readConsent(root).consent;
  const consent = {
    $schema: 'https://buaflow.dev/schemas/usage-consent-v1.json',
    schemaVersion: SCHEMA_VERSION,
    enabled: Boolean(enabled),
    project: sanitizeName(project || previous?.project || defaultProject(root)),
    decidedBy: decidedBy || whoAmI(root),
    decidedAt: now.toISOString().slice(0, 10),
  };
  fs.mkdirSync(path.dirname(consentFile(root)), { recursive: true });
  fs.writeFileSync(consentFile(root), `${JSON.stringify(consent, null, 2)}\n`);
  return consent;
}

function readJsonOr(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

// The session's cwd follows every `cd`. The project is the nearest repository above it that holds a consent file —
// so a submodule or nested clone inside an opted-in project does not hide it — else the nearest repository.
// Only folders with .git count: ~/.buaflow/usage.json is the machine config, not a project's consent.
// A worktree has its own .git file and its own committed consent, so it still records against itself.
function projectRoot(start) {
  let dir = path.resolve(start);
  let nearestGit = null;
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      if (fs.existsSync(consentFile(dir))) return dir;
      nearestGit = nearestGit || dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return nearestGit || path.resolve(start);
    dir = parent;
  }
}

function readState(root) {
  const { marker, ...state } = readJsonOr(stateFile(root), {});
  return { seen: {}, sessions: {}, synced: {}, readinessHash: null, ...state, marker: readJsonOr(markerFile(root), null) };
}

function ensureUsageDir(root) {
  fs.mkdirSync(eventsDir(root), { recursive: true });
  // The folder ignores itself, so events never reach the project's git whatever its .gitignore says.
  const ignore = path.join(usageDir(root), '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n');
}

// Write then rename: a hook reading at the same moment sees the old file or the new one, never half of one.
function writeJsonAtomic(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  const text = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(temp, text);
  try {
    fs.renameSync(temp, file);
  } catch {
    // Windows refuses the rename while another process has the target open; a plain write beats losing the update.
    try { fs.writeFileSync(file, text); } finally { fs.rmSync(temp, { force: true }); }
  }
}

// The marker lives in its own file, so a Bash hook running beside a Write hook never overwrites what the Write saw.
function writeState(root, state) {
  ensureUsageDir(root);
  const { marker, ...rest } = state;
  writeJsonAtomic(stateFile(root), rest);
}

function writeMarker(root, marker) {
  ensureUsageDir(root);
  writeJsonAtomic(markerFile(root), marker);
}

function readMachineConfig() {
  return readJsonOr(machineConfigFile(), null);
}

// From the kit itself (repo or plugin kit/), else the version the project locked — never the project's own package.json.
function kitVersion(root) {
  const kit = readJsonOr(path.join(__dirname, '..', 'package.json'), {});
  if (kit.name === 'buaflow' && kit.version) return kit.version;
  return readJsonOr(path.join(root, '.buaflow', 'lock.json'), {}).kitVersion || 'unknown';
}

// A marker older than a minute may belong to a session that has moved on: unknown beats a guess.
function markerModel(state, now = Date.now()) {
  const marker = state?.marker;
  const at = marker ? Date.parse(marker.at) : NaN;
  if (!marker?.model || Number.isNaN(at) || now - at > MARKER_MAX_AGE_MS || now < at) return { model: 'unknown', sessionId: null };
  return { model: marker.model, sessionId: marker.sessionId || null };
}

function modelFromTranscript(file) {
  if (!file) return null;
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, TRANSCRIPT_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, size - length);
    const matches = buffer.toString('utf8').match(/"model"\s*:\s*"(claude-[A-Za-z0-9._\-[\]]+)"/g);
    if (!matches) return null;
    return matches[matches.length - 1].replace(/^.*"(claude-[^"]+)"$/, '$1');
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function redact(value) {
  if (typeof value === 'string') return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, '[REDACTED]'), value);
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
  return value;
}

function buildEvent(root, { type, task = null, data = {}, model = 'unknown', sessionId = null, project, commit, now = new Date() }) {
  const machine = readMachineConfig()?.machine || sanitizeName(os.hostname());
  return {
    schemaVersion: SCHEMA_VERSION,
    id: crypto.randomUUID(),
    type,
    at: now.toISOString(),
    project: project || readConsent(root).consent?.project || defaultProject(root),
    task,
    model: model || 'unknown',
    kitVersion: kitVersion(root),
    commit: commit === undefined ? headCommit(root) : commit,
    sessionId,
    machine,
    data: redact(data),
  };
}

function validateEvent(event) {
  const errors = [];
  if (!event || typeof event !== 'object') return ['event must be an object'];
  for (const field of EVENT_FIELDS) if (!(field in event)) errors.push(`missing field: ${field}`);
  for (const key of Object.keys(event)) if (!EVENT_FIELDS.includes(key)) errors.push(`unknown field: ${key}`);
  if (event.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  if (!/^[0-9a-f-]{36}$/.test(event.id || '')) errors.push('id must be a uuid');
  if (!EVENT_TYPES.includes(event.type)) errors.push(`unknown type: ${event.type}`);
  if (Number.isNaN(Date.parse(event.at))) errors.push('at must be a date-time');
  if (!NAME_PATTERN.test(event.project || '')) errors.push('project must match [a-z0-9._-]');
  if (event.task !== null && typeof event.task !== 'string') errors.push('task must be a string or null');
  if (typeof event.model !== 'string' || !event.model) errors.push('model must be a non-empty string');
  if (typeof event.kitVersion !== 'string') errors.push('kitVersion must be a string');
  for (const field of ['commit', 'sessionId', 'machine']) if (event[field] !== null && typeof event[field] !== 'string') errors.push(`${field} must be a string or null`);
  if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) errors.push('data must be an object');
  return errors;
}

function appendEvent(root, event) {
  ensureUsageDir(root);
  const file = path.join(eventsDir(root), `${event.at.slice(0, 10)}.jsonl`);
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`);
  return file;
}

// Returns { recorded: false } without touching disk unless the project said yes.
function record(root, input) {
  const consent = readConsent(root);
  if (consent.state !== 'enabled') return { recorded: false, reason: consent.state };
  const event = buildEvent(root, { ...input, project: consent.consent.project });
  const errors = validateEvent(event);
  if (errors.length) return { recorded: false, reason: 'invalid', errors };
  return { recorded: true, event, file: appendEvent(root, event) };
}

// The three folders whose files tell the lifecycle; nothing outside them is ever read (design: ความปลอดภัย).
const WATCHED = Object.freeze({ intent: 'docs/intents', plan: 'docs/plans', task: 'docs/backlog/tasks' });

// Resolves under root or not at all, so `../../.env` never gets read.
function watchedFile(root, file) {
  if (typeof file !== 'string' || !file) return null;
  const rel = path.relative(path.resolve(root), path.resolve(root, file)).split(path.sep).join('/');
  if (!rel || rel.startsWith('../') || path.isAbsolute(rel)) return null;
  const name = path.posix.basename(rel);
  if (!name.endsWith('.md') || name.startsWith('_')) return null;
  const kind = Object.keys(WATCHED).find((key) => WATCHED[key] === path.posix.dirname(rel));
  return kind ? { kind, rel } : null;
}

function watchedFiles(root) {
  return Object.values(WATCHED).flatMap((dir) => {
    try { return fs.readdirSync(path.join(root, dir)).filter((name) => name.endsWith('.md') && !name.startsWith('_')).map((name) => `${dir}/${name}`); } catch { return []; }
  }).sort();
}

function readText(root, rel) {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return null; }
}

// Template placeholders (`<ใครอนุมัติ>`, `YYYY-MM-DD`) are not answers — R8: record null, never the placeholder.
function real(value) {
  if (value === undefined || value === null || value === '') return null;
  return /^<.*>$/.test(String(value)) || /^YYYY/.test(String(value)) ? null : value;
}

function acceptanceOf(text) {
  const section = String(text).match(/^##\s+Acceptance Criteria[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m);
  if (!section) return [];
  return section[1].split(/\r?\n/).map((line) => line.match(/^\s*-\s*\[[ xX]\]\s*(.+)$/)?.[1]?.trim()).filter(Boolean);
}

function taskIdOf(kind, rel, meta) {
  if (kind === 'intent') return null;
  const fromName = path.posix.basename(rel).match(/^([A-Za-z]+-\d+)/)?.[1] || null;
  return real(kind === 'task' ? meta.id : meta.task) || fromName;
}

// Compares one file with what was last seen and returns the events it implies; state.seen is updated in place.
function observeFile(root, state, rel, text, { source } = {}) {
  const found = watchedFile(root, rel);
  if (!found) return [];
  const { kind } = found;
  const meta = frontmatter(text) || {};
  const task = taskIdOf(kind, rel, meta);
  const now = kind === 'task' ? { status: real(meta.status) } : kind === 'plan' ? { approvedBy: real(meta.approved_by) } : {};
  const before = state.seen[rel];
  state.seen[rel] = now;
  const extra = source ? { source } : {};
  const out = [];
  if (!before && kind === 'intent') out.push({ type: 'intent.opened', task, data: { path: rel, content: text, ...extra } });
  if (!before && kind === 'task') {
    out.push({ type: 'task.created', task, data: { path: rel, acceptance: acceptanceOf(text), estimate: real(meta.estimate), fixes: real(meta.fixes), content: text, ...extra } });
  }
  if (kind === 'plan' && now.approvedBy && !before?.approvedBy) out.push({ type: 'plan.approved', task, data: { path: rel, approvedBy: now.approvedBy, content: text, ...extra } });
  if (kind === 'task' && before && now.status && now.status !== before.status) {
    out.push({ type: 'task.status', task, data: { from: before.status || null, to: now.status, ...extra } });
    if (now.status === 'done') out.push({ type: 'task.done', task, data: { commit: real(meta.commit), started: real(meta.started), closed: real(meta.closed), sessions: null, ...extra } });
  }
  return out;
}

// First contact (consent just given, or state lost): remember what exists without calling it new, so an old
// project does not replay its history. The file being written right now is judged by its committed version.
function baseline(root, state, { except = null } = {}) {
  for (const rel of watchedFiles(root)) {
    if (rel === except) continue;
    const text = readText(root, rel);
    if (text !== null) observeFile(root, state, rel, text);
  }
  if (except) {
    const committed = git(root, ['show', `HEAD:./${except}`]);
    if (committed !== null) observeFile(root, state, except, committed);
  }
  state.baselineAt = new Date().toISOString();
}

// Changes made outside any session (a pull, an editor) — nobody knows which model made them.
function reconcile(root, state) {
  return watchedFiles(root).flatMap((rel) => {
    const text = readText(root, rel);
    return text === null ? [] : observeFile(root, state, rel, text, { source: 'reconcile' });
  });
}

function rememberSession(state, task, sessionId) {
  if (!task || !sessionId) return;
  const list = state.sessions[task] || [];
  if (!list.includes(sessionId)) state.sessions[task] = [...list, sessionId];
}

function recordObserved(root, state, found, { model = 'unknown', sessionId = null } = {}) {
  if (!found.length) return [];
  const commit = headCommit(root);
  const recorded = [];
  for (const input of found) {
    rememberSession(state, input.task, sessionId);
    const data = input.type === 'task.done' ? { ...input.data, sessions: state.sessions[input.task]?.length || null } : input.data;
    const result = record(root, { ...input, data, model, sessionId, commit });
    if (result.recorded) recorded.push(result.event);
  }
  return recorded;
}

function modelOf(input) {
  return (typeof input.model === 'string' && input.model) || modelFromTranscript(input.transcript_path) || 'unknown';
}

// Everything the usage-capture hook does once the project has said yes. Returns the events it recorded.
// Only SessionStart and a write to a watched file touch state.json; every other call refreshes the marker alone.
function handleHook(root, input, now = new Date()) {
  const sessionId = input.session_id || null;
  const model = modelOf(input);
  writeMarker(root, { sessionId, model, at: now.toISOString() });
  const found = input.hook_event_name === 'PostToolUse' ? watchedFile(root, input.tool_input?.file_path) : null;
  if (input.hook_event_name !== 'SessionStart' && !found) return [];
  const state = readState(root);
  let recorded = [];
  if (!found) {
    if (!state.baselineAt) baseline(root, state);
    else recorded = recordObserved(root, state, reconcile(root, state));
  } else {
    if (!state.baselineAt) baseline(root, state, { except: found.rel });
    const text = readText(root, found.rel);
    if (text !== null) recorded = recordObserved(root, state, observeFile(root, state, found.rel, text), { model, sessionId });
  }
  writeState(root, state);
  return recorded;
}

function sessionNotice(consentState) {
  if (consentState === 'enabled') return 'โปรเจกต์นี้เก็บข้อมูลการใช้งาน Buaflow — ปิดได้ที่ .buaflow/usage.json (enabled: false) หรือ buaflow usage consent --disable';
  if (consentState === 'invalid') return 'ไฟล์ยินยอม .buaflow/usage.json อ่านไม่ได้ — ไม่ได้เก็บข้อมูลการใช้งาน (buaflow usage status บอกสาเหตุ)';
  return null;
}

function countLines(file, fromByte = 0) {
  try {
    const text = fs.readFileSync(file).subarray(fromByte).toString('utf8');
    return text.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

function pendingEvents(root) {
  if (!fs.existsSync(eventsDir(root))) return 0;
  const synced = readState(root).synced || {};
  return fs.readdirSync(eventsDir(root)).filter((name) => name.endsWith('.jsonl'))
    .reduce((sum, name) => sum + countLines(path.join(eventsDir(root), name), synced[name] || 0), 0);
}

function status(root) {
  const consent = readConsent(root);
  const machine = readMachineConfig();
  return {
    consent: consent.state,
    project: consent.consent?.project || null,
    decidedBy: consent.consent?.decidedBy || null,
    decidedAt: consent.consent?.decidedAt || null,
    pending: pendingEvents(root),
    store: machine?.store || null,
    errors: consent.errors,
  };
}

function parseArgs(args) {
  const [sub, ...rest] = args;
  const options = { sub, kind: null, enable: false, disable: false, project: null, task: null, verdict: null, findings: null, level: null };
  let index = 0;
  if (sub === 'record') options.kind = rest[index++];
  for (; index < rest.length; index++) {
    const arg = rest[index];
    const value = () => {
      const next = rest[++index];
      if (next === undefined || (next.startsWith('--') && next !== '-')) throw new Error(`${arg} requires a value`);
      return next;
    };
    if (arg === '--enable') options.enable = true;
    else if (arg === '--disable') options.disable = true;
    else if (arg === '--project') options.project = value();
    else if (arg === '--task') options.task = value();
    else if (arg === '--verdict') options.verdict = value();
    else if (arg === '--findings') options.findings = value();
    else if (arg === '--level') options.level = value();
    else throw new Error(`unknown usage option: ${arg}`);
  }
  if (!['consent', 'status', 'record'].includes(sub)) throw new Error('usage needs a subcommand: consent, status or record');
  if (sub === 'consent' && options.enable === options.disable) throw new Error('usage consent needs exactly one of --enable or --disable');
  if (sub === 'record') {
    if (options.kind !== 'check') throw new Error('usage record supports: check');
    if (!TASK_PATTERN.test(options.task || '')) throw new Error('--task is required (e.g. T-012)');
    if (!['pass', 'fail'].includes(options.verdict)) throw new Error('--verdict must be pass or fail');
  }
  return options;
}

function readFindings(source) {
  if (!source) return [];
  const text = source === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(source, 'utf8');
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : [value];
  } catch {
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
}

// Result shape matches the CLI envelope fields: { code, summary, data, warnings, errors }.
function runCommand(start, args) {
  // /check calls `usage record check` from wherever the session has cd-ed to — same root as the hook uses.
  const root = projectRoot(start);
  let options;
  try { options = parseArgs(args); } catch (error) { return { code: 2, summary: 'invalid usage input', data: {}, warnings: [], errors: [error.message] }; }

  if (options.sub === 'status') {
    const s = status(root);
    const warnings = [];
    if (s.consent === 'invalid') warnings.push(`.buaflow/usage.json cannot be read, so nothing is recorded: ${s.errors.join('; ')}`);
    if (s.consent === 'enabled' && !s.store) warnings.push('no central store on this machine yet: buaflow usage setup --store <path to your clone>');
    return { code: 0, summary: `consent ${s.consent}${s.project ? ` (${s.project})` : ''} · ${s.pending} event(s) not synced`, data: s, warnings, errors: [] };
  }

  if (options.sub === 'consent') {
    if (git(root, ['rev-parse', '--is-inside-work-tree']) !== 'true') return { code: 1, summary: 'not a git repository', data: {}, warnings: [], errors: ['consent is stored in the project and committed; run it inside the project repository'] };
    const consent = writeConsent(root, { enabled: options.enable, project: options.project });
    return { code: 0, summary: `usage capture ${consent.enabled ? 'enabled' : 'disabled'} for ${consent.project} — commit .buaflow/usage.json`, data: { file: '.buaflow/usage.json', consent }, warnings: [], errors: [] };
  }

  // record check: never fails the caller — /check must not break because recording did.
  try {
    const state = readState(root);
    const marker = markerModel(state);
    const result = record(root, {
      type: 'check.result',
      task: options.task,
      model: marker.model,
      sessionId: marker.sessionId,
      data: { verdict: options.verdict, findings: readFindings(options.findings), level: options.level },
    });
    if (!result.recorded) return { code: 0, summary: `not recorded (consent ${result.reason})`, data: { recorded: false, reason: result.reason }, warnings: result.errors || [], errors: [] };
    if (marker.sessionId) {
      rememberSession(state, options.task, marker.sessionId);
      writeState(root, state);
    }
    return { code: 0, summary: `recorded check.result for ${options.task}`, data: { recorded: true, id: result.event.id, file: path.relative(root, result.file).split(path.sep).join('/') }, warnings: [], errors: [] };
  } catch (error) {
    return { code: 0, summary: 'not recorded (error)', data: { recorded: false, reason: 'error' }, warnings: [error.message], errors: [] };
  }
}

// `node .claude/usage.js <subcommand>` — the same commands as `buaflow usage`, for skills and hooks in a project,
// where .claude/usage.js is installed in both modes but the buaflow CLI lives wherever the kit is.
function main(argv = process.argv.slice(2)) {
  const args = [];
  let root = process.cwd();
  let json = false;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--root') root = argv[++index] || root;
    else if (argv[index] === '--json') json = true;
    else args.push(argv[index]);
  }
  const result = runCommand(path.resolve(root), args);
  const out = { schemaVersion: '1.0', command: 'usage', status: result.code === 0 ? 'ok' : 'error', ...result };
  if (json) process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  else {
    console.log(`buaflow usage: ${out.status.toUpperCase()} — ${out.summary}`);
    for (const warning of out.warnings) console.log(`  warn: ${warning}`);
    for (const error of out.errors) console.log(`  fail: ${error}`);
  }
  return result.code;
}

if (require.main === module) process.exit(main());

module.exports = {
  EVENT_FIELDS,
  EVENT_TYPES,
  MARKER_MAX_AGE_MS,
  SCHEMA_VERSION,
  WATCHED,
  acceptanceOf,
  appendEvent,
  baseline,
  buildEvent,
  consentFile,
  defaultProject,
  eventsDir,
  handleHook,
  headCommit,
  machineConfigFile,
  markerFile,
  markerModel,
  modelFromTranscript,
  observeFile,
  parseArgs,
  pendingEvents,
  projectRoot,
  readConsent,
  readState,
  reconcile,
  record,
  redact,
  runCommand,
  sanitizeName,
  sessionNotice,
  stateFile,
  status,
  usageDir,
  watchedFile,
  validateConsent,
  validateEvent,
  writeConsent,
  writeMarker,
  writeState,
};
