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
const SETUP_HINT = 'buaflow usage setup --store <path to your clone>';
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
const syncedFile = (root) => path.join(usageDir(root), 'synced.json');
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
  const { marker, synced, ...state } = readJsonOr(stateFile(root), {});
  return { seen: {}, sessions: {}, readinessHash: null, ...state, synced: readJsonOr(syncedFile(root), {}), marker: readJsonOr(markerFile(root), null) };
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

// The marker and the sync offsets live in their own files, each with one writer: a Bash hook beside a Write hook
// never overwrites what the Write saw, and a hook never rolls back an offset a background sync just saved.
function writeState(root, state) {
  ensureUsageDir(root);
  const { marker, synced, ...rest } = state;
  writeJsonAtomic(stateFile(root), rest);
}

function writeSynced(root, synced) {
  ensureUsageDir(root);
  writeJsonAtomic(syncedFile(root), synced);
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
  // Session start and end are the two moments a sync goes out (R6); it never runs inside the gate.
  // A session that is ending does no work any more, so it leaves the marker to whoever runs next.
  if (input.hook_event_name === 'SessionEnd') {
    if (readMachineConfig()?.store) startBackgroundSync(root);
    return [];
  }
  const model = modelOf(input);
  writeMarker(root, { sessionId, model, at: now.toISOString() });
  if (input.hook_event_name === 'SessionStart') {
    const recorded = observeSessionStart(root);
    if (readMachineConfig()?.store) startBackgroundSync(root);
    return recorded;
  }
  const found = input.hook_event_name === 'PostToolUse' ? watchedFile(root, input.tool_input?.file_path) : null;
  return found ? observeWrite(root, found, { model, sessionId }) : [];
}

// Changes made while no session was looking; the very first run only takes a baseline.
function observeSessionStart(root) {
  const state = readState(root);
  let recorded = [];
  if (!state.baselineAt) baseline(root, state);
  else recorded = recordObserved(root, state, reconcile(root, state));
  // Readiness is a state, not history: the first contact records where the project stands, too.
  recorded = recorded.concat(recordObserved(root, state, readinessSnapshot(root, state)));
  writeState(root, state);
  return recorded;
}

const READINESS_FILE = path.join('docs', 'evidence', 'readiness.json');

// A changed readiness manifest becomes one snapshot (AC-23), so projects that rarely run `buaflow audit` still
// show their level. validateManifest without a freshness window runs no git and no evidence commands.
function readinessSnapshot(root, state) {
  let text;
  try { text = fs.readFileSync(path.join(root, READINESS_FILE), 'utf8'); } catch { return []; }
  let manifest = null;
  try { manifest = JSON.parse(text); } catch { /* recorded as unreadable below */ }
  // Hash what it says, not how it is laid out: a formatter rewriting the file is not a new state.
  const hash = crypto.createHash('sha256').update(manifest ? JSON.stringify(manifest) : text).digest('hex');
  if (hash === state.readinessHash) return [];
  state.readinessHash = hash;
  let checked = null;
  try { checked = manifest && require('./readiness.js').validateManifest(manifest, { root }); } catch { /* outcome stays null */ }
  return [{
    type: 'readiness.snapshot',
    task: null,
    data: {
      level: manifest?.targetLevel ?? null,
      generatedAt: manifest?.generatedAt ?? null,
      manifestCommit: manifest?.commit ?? null, // what the evidence describes; the event's own commit is HEAD now
      outcome: manifest ? checked?.outcome ?? null : 'unreadable',
      passed: checked?.passed ?? null,
      required: checked?.required ?? null,
    },
  }];
}

// `buaflow audit` calls this with the verifier's result (AC-11). Never throws: an audit must not fail because recording did.
// The manifest is read from where the verifier read it (start); the walked-up root only decides where events go.
function recordAudit(start, { result, file = READINESS_FILE }) {
  try {
    const root = projectRoot(start);
    const marker = markerModel(readState(root));
    const manifest = readJsonOr(path.resolve(start, file), {});
    return record(root, {
      type: 'verifier.audit',
      task: null,
      model: marker.model,
      sessionId: marker.sessionId,
      data: {
        level: result?.level ?? null,
        ok: result?.ok ?? null,
        executed: Boolean(result?.executed),
        counts: result?.counts ?? null,
        verdicts: Array.isArray(result?.verdicts) ? result.verdicts : [],
        generatedAt: manifest.generatedAt ?? null,
      },
    });
  } catch (error) {
    return { recorded: false, reason: 'error', errors: [error.message] };
  }
}

function observeWrite(root, found, who) {
  const state = readState(root);
  if (!state.baselineAt) baseline(root, state, { except: found.rel });
  const text = readText(root, found.rel);
  const recorded = text === null ? [] : recordObserved(root, state, observeFile(root, state, found.rel, text), who);
  writeState(root, state);
  return recorded;
}

// One line at session start (AC-5), plus what needs doing on this machine (AC-18) and what is still waiting.
function sessionNotice(consentState, root) {
  const review = root ? reviewNotice(root) : null;
  const own = projectNotice(consentState, root);
  return [own, review].filter(Boolean).join(' · ') || null;
}

function reviewNotice(root) {
  try { return require('./usage-report.js').reviewNotice(root); } catch { return null; }
}

function projectNotice(consentState, root) {
  if (consentState === 'enabled') {
    const parts = ['โปรเจกต์นี้เก็บข้อมูลการใช้งาน Buaflow — ปิดได้ที่ .buaflow/usage.json (enabled: false) หรือ buaflow usage consent --disable'];
    if (!readMachineConfig()?.store) parts.push(`เครื่องนี้ยังไม่ได้ตั้งค่าที่เก็บกลาง: ${SETUP_HINT}`);
    const pending = root ? pendingEvents(root) : 0;
    if (pending) parts.push(`ค้าง sync ${pending} event`);
    return parts.join(' · ');
  }
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

function result(code, summary, data = {}, warnings = [], errors = []) {
  return { code, summary, data, warnings, errors };
}

// Tags what sync's own git does in the store's reflog, so sync can tell its rebase from one a person started.
const SYNC_REFLOG_ACTION = 'buaflow-usage-sync';

// Network git never waits on a prompt: a background sync has nobody to answer it.
function gitRemote(store, args) {
  try {
    return execFileSync('git', args, { cwd: store, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: 60 * 1000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_REFLOG_ACTION: SYNC_REFLOG_ACTION } }).trim();
  } catch {
    return null;
  }
}

function setup(start, { store, machine }) {
  const dir = path.resolve(start, store);
  if (!fs.existsSync(dir) || git(dir, ['rev-parse', '--is-inside-work-tree']) !== 'true') {
    return result(1, 'the store is not a git work tree', {}, [], [`${dir}: clone the private store repository first, then point --store at the clone`]);
  }
  const previous = readMachineConfig() || {};
  const config = {
    schemaVersion: SCHEMA_VERSION,
    store: path.resolve(git(dir, ['rev-parse', '--show-toplevel'])),
    machine: sanitizeName(machine || previous.machine || os.hostname()),
    lastReviewAt: previous.lastReviewAt ?? null,
  };
  fs.mkdirSync(path.dirname(machineConfigFile()), { recursive: true });
  fs.writeFileSync(machineConfigFile(), `${JSON.stringify(config, null, 2)}\n`);
  return result(0, `central store for this machine: ${config.store} (machine ${config.machine})`, { file: machineConfigFile(), config });
}

// A lock older than this belongs to a sync that died; waiting on it forever would stop every later sync.
const LOCK_STALE_MS = 5 * 60 * 1000;

function takeLock(file, now) {
  try { fs.writeFileSync(file, String(process.pid), { flag: 'wx' }); return true; } catch { /* held — maybe stale */ }
  try {
    if (now - fs.statSync(file).mtimeMs <= LOCK_STALE_MS) return false;
    fs.rmSync(file, { force: true });
    fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

// Appends each day file's complete, unsynced lines to the same day file under target; returns what to undo.
function copyPending(root, target) {
  const synced = readState(root).synced;
  const out = { offsets: {}, appended: [], count: 0 };
  const names = fs.existsSync(eventsDir(root)) ? fs.readdirSync(eventsDir(root)).filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)).sort() : [];
  for (const name of names) {
    const bytes = fs.readFileSync(path.join(eventsDir(root), name));
    const end = bytes.lastIndexOf(0x0a) + 1; // a line still being written stays for the next round
    if (end <= (synced[name] || 0)) continue;
    const chunk = bytes.subarray(synced[name] || 0, end);
    const dest = path.join(target, name);
    fs.mkdirSync(target, { recursive: true });
    out.appended.push({ dest, size: fs.existsSync(dest) ? fs.statSync(dest).size : null });
    fs.appendFileSync(dest, chunk);
    out.offsets[name] = end;
    out.count += chunk.toString('utf8').split('\n').filter(Boolean).length;
  }
  return out;
}

// A failed commit undoes the appends: left uncommitted, the next round would append the same lines again.
function commitOrUndo(store, rel, appended, message) {
  if (git(store, ['add', '--', rel]) !== null && git(store, ['commit', '-q', '-m', message, '--', rel]) !== null) return true;
  git(store, ['reset', '-q', '--', rel]);
  for (const { dest, size } of appended) {
    if (size === null) fs.rmSync(dest, { force: true }); else fs.truncateSync(dest, size);
  }
  return false;
}

// Pull, and never leave the clone mid-rebase: commits made on a detached HEAD would advance the offsets and then
// vanish with the next `rebase --abort`. Offline is fine (this machine's files are only written here); a store
// that is not on a branch, or is mid-rebase or mid-merge, gets nothing appended. Returns why, or null.
function pullClean(store, gitDir) {
  // Someone may be resolving a conflict in the store right now: look before pulling, and never touch their work.
  const rebasing = () => ['rebase-merge', 'rebase-apply'].some((name) => fs.existsSync(path.join(gitDir, name)));
  const busy = () => {
    if (rebasing()) return 'a rebase is in progress — finish or abort it, then sync again';
    if (fs.existsSync(path.join(gitDir, 'MERGE_HEAD'))) return 'a merge is in progress — finish or abort it, then sync again';
    return null;
  };
  const before = busy();
  if (before) return before;
  // The tag lives in HEAD's reflog, so sync's pull writes one even in a store that turned reflogs off.
  const pulled = gitRemote(store, ['-c', 'core.logAllRefUpdates=true', 'pull', '--rebase', '--quiet']) !== null;
  // Abort only a rebase whose reflog carries sync's tag: one a person starts in the same seconds says "pull --rebase".
  const ours = () => (git(store, ['reflog', '-1', '--format=%gs', 'HEAD']) || '').startsWith(SYNC_REFLOG_ACTION);
  if (!pulled && rebasing() && ours()) git(store, ['rebase', '--abort']);
  const after = busy();
  if (after) return after;
  if (git(store, ['symbolic-ref', '-q', 'HEAD']) === null) return 'HEAD is detached — check out the branch the store pushes, then sync again';
  // Fetched but could not rebase: every push would be refused, so appending would only move offsets for nothing.
  if (!pulled && Number(git(store, ['rev-list', '--count', 'HEAD..@{u}']) || 0) > 0) {
    return 'the store has commits from its remote that do not rebase cleanly (two machines under one name?) — run git pull --rebase there and resolve it, then sync again';
  }
  return null;
}

// Copies complete lines past the saved offset into <store>/events/<project>/<machine>/, commits, then pushes.
// The offset moves only after the commit, so a crash in between re-sends lines and the report drops them by id.
function sync(root, now = Date.now()) {
  const consent = readConsent(root);
  if (consent.state !== 'enabled') return result(0, `not synced (consent ${consent.state})`, { synced: 0 });
  const config = readMachineConfig();
  if (!config?.store) return result(0, 'not synced: no central store on this machine', { synced: 0, pending: pendingEvents(root) }, [SETUP_HINT]);
  const store = config.store;
  const gitDir = fs.existsSync(store) ? git(store, ['rev-parse', '--absolute-git-dir']) : null;
  if (!gitDir) return result(3, 'the central store is not a git repository — events stay here', { synced: 0, pending: pendingEvents(root) }, [], [`${store}: ${SETUP_HINT}`]);
  const lock = path.join(gitDir, 'buaflow-usage.lock');
  if (!takeLock(lock, now)) return result(0, 'another sync is running', { synced: 0, locked: true });
  try {
    const blocked = pullClean(store, gitDir);
    if (blocked) return result(3, 'the central store needs attention — events stay here', { synced: 0, pending: pendingEvents(root) }, [], [`${store}: ${blocked}`]);
    const project = consent.consent.project;
    const machine = sanitizeName(config.machine || os.hostname());
    const target = path.join(store, 'events', project, machine);
    const rel = path.relative(store, target).split(path.sep).join('/');
    const { offsets, appended, count } = copyPending(root, target);
    if (count) {
      if (!commitOrUndo(store, rel, appended, `usage: ${project} ${count} events`)) {
        return result(3, 'could not commit in the central store — events stay here', { synced: 0, pending: pendingEvents(root) }, [], [`git commit failed in ${store} (is user.name set there?)`]);
      }
      writeSynced(root, { ...readState(root).synced, ...offsets });
    }
    // Push even with nothing new: a commit left by an earlier failed push goes out now.
    if (gitRemote(store, ['push', '--quiet']) === null) {
      return result(3, `${count} event(s) committed in the store; push failed — it retries on the next sync`, { synced: count, pushed: false });
    }
    return result(0, `synced ${count} event(s) to ${store}`, { synced: count, pushed: true, file: rel });
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

// Detached and unref'd: the session's hook returns at once and the sync finishes on its own.
function startBackgroundSync(root) {
  const { spawn } = require('node:child_process');
  spawn(process.execPath, [__filename, 'sync', '--root', root], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

function parseArgs(args) {
  const [sub, ...rest] = args;
  const options = { sub, kind: null, enable: false, disable: false, project: null, task: null, verdict: null, findings: null, level: null, store: null, machine: null, target: null, out: null, since: null };
  let index = 0;
  if (sub === 'record') options.kind = rest[index++];
  if (sub === 'show') options.target = rest[index++];
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
    else if (arg === '--store') options.store = value();
    else if (arg === '--machine') options.machine = value();
    else if (arg === '--out') options.out = value();
    else if (arg === '--since') options.since = value();
    else throw new Error(`unknown usage option: ${arg}`);
  }
  if (!['consent', 'status', 'record', 'setup', 'sync', 'report', 'show'].includes(sub)) throw new Error('usage needs a subcommand: consent, status, record, setup, sync, report or show');
  if (sub === 'show' && !/^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9._-]+$/.test(options.target || '')) throw new Error('usage show needs <project>/<task>, e.g. bluepeak-hub/T-012');
  if (options.since && !/^\d{4}-\d{2}-\d{2}$/.test(options.since)) throw new Error('--since must be YYYY-MM-DD');
  if (sub === 'setup' && !options.store) throw new Error('usage setup needs --store <path to your clone of the central store>');
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
    if (s.consent === 'enabled' && !s.store) warnings.push(`no central store on this machine yet: ${SETUP_HINT}`);
    return { code: 0, summary: `consent ${s.consent}${s.project ? ` (${s.project})` : ''} · ${s.pending} event(s) not synced`, data: s, warnings, errors: [] };
  }

  if (options.sub === 'setup') return setup(start, options);
  if (options.sub === 'sync') return sync(root);
  // Reading the store is kit-only (usage-report.js is never installed into a project).
  if (options.sub === 'report') return require('./usage-report.js').report({ out: options.out && path.resolve(start, options.out), since: options.since });
  if (options.sub === 'show') return require('./usage-report.js').show(options.target);

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
    if (out.data?.text) process.stdout.write(out.data.text);
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
  LOCK_STALE_MS,
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
  recordAudit,
  redact,
  runCommand,
  sanitizeName,
  sessionNotice,
  setup,
  stateFile,
  status,
  sync,
  syncedFile,
  usageDir,
  watchedFile,
  validateConsent,
  validateEvent,
  writeConsent,
  writeMarker,
  writeState,
};
