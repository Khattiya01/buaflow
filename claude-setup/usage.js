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
const machineConfigFile = () => path.join(os.homedir(), '.buaflow', 'usage.json');

function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
  } catch {
    return null;
  }
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

function readState(root) {
  const state = readJsonOr(stateFile(root), {});
  return { seen: {}, sessions: {}, synced: {}, readinessHash: null, marker: null, ...state };
}

function ensureUsageDir(root) {
  fs.mkdirSync(eventsDir(root), { recursive: true });
  // The folder ignores itself, so events never reach the project's git whatever its .gitignore says.
  const ignore = path.join(usageDir(root), '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n');
}

function writeState(root, state) {
  ensureUsageDir(root);
  fs.writeFileSync(stateFile(root), `${JSON.stringify(state, null, 2)}\n`);
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

function buildEvent(root, { type, task = null, data = {}, model = 'unknown', sessionId = null, project, now = new Date() }) {
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
    commit: git(root, ['rev-parse', '--short', 'HEAD']),
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
function runCommand(root, args) {
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
    const marker = markerModel(readState(root));
    const result = record(root, {
      type: 'check.result',
      task: options.task,
      model: marker.model,
      sessionId: marker.sessionId,
      data: { verdict: options.verdict, findings: readFindings(options.findings), level: options.level },
    });
    if (!result.recorded) return { code: 0, summary: `not recorded (consent ${result.reason})`, data: { recorded: false, reason: result.reason }, warnings: result.errors || [], errors: [] };
    return { code: 0, summary: `recorded check.result for ${options.task}`, data: { recorded: true, id: result.event.id, file: path.relative(root, result.file).split(path.sep).join('/') }, warnings: [], errors: [] };
  } catch (error) {
    return { code: 0, summary: 'not recorded (error)', data: { recorded: false, reason: 'error' }, warnings: [error.message], errors: [] };
  }
}

module.exports = {
  EVENT_FIELDS,
  EVENT_TYPES,
  MARKER_MAX_AGE_MS,
  SCHEMA_VERSION,
  appendEvent,
  buildEvent,
  consentFile,
  defaultProject,
  eventsDir,
  machineConfigFile,
  markerModel,
  modelFromTranscript,
  parseArgs,
  pendingEvents,
  readConsent,
  readState,
  record,
  redact,
  runCommand,
  sanitizeName,
  status,
  usageDir,
  validateConsent,
  validateEvent,
  writeConsent,
  writeState,
};
