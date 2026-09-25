'use strict';

/**
 * EV-011 — reading the central store: `buaflow usage report | show | eval-draft` and the review notice (AC-21..27).
 * Runs in the Buaflow repository only, so it is kit-only: install.js never copies it into a project.
 * Reads the store clone as it is. It writes only a draft eval case (evals/drafts/, never events/) and the
 * machine config's review fields.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { frontmatter } = require('./convergence.js');
const usage = require('./usage.js');

// Order for "moved backward". blocked is a detour, not a step, so it never counts either way.
const STATUS_RANK = Object.freeze({ backlog: 0, todo: 1, 'in-progress': 2, review: 3, done: 4 });
const DAY_MS = 24 * 60 * 60 * 1000;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

// One line of the store: the event, or which count it goes to instead.
function classify(line, seen) {
  let event;
  try { event = JSON.parse(line); } catch { return 'unreadable'; }
  if (event?.schemaVersion !== usage.SCHEMA_VERSION) return 'skipped';
  if (seen.has(event.id)) return 'duplicates';
  seen.add(event.id);
  return event;
}

// Two processes recording one thing at the same moment write two events with their own ids, so dropping
// duplicate ids does not catch them. The capture side refuses these now, but the store keeps every event it
// already let through, and counting them twice doubles a /check fail rate and repeats an eval draft's
// criteria. Same project, type, task and data within a minute of each other is one thing, not two.
const REPEAT_WINDOW_MS = 60 * 1000;

function dropRepeats(events) {
  const lastAt = new Map();
  const kept = [];
  let repeats = 0;
  for (const event of events) {
    const key = `${event.project}|${event.type}|${event.task}|${JSON.stringify(event.data)}`;
    const at = Date.parse(event.at);
    const before = lastAt.get(key);
    if (before !== undefined && Number.isFinite(at) && at - before < REPEAT_WINDOW_MS) {
      repeats++;
      continue;
    }
    lastAt.set(key, Number.isFinite(at) ? at : 0);
    kept.push(event);
  }
  return { events: kept, repeats };
}

// Every event once (AC-19: a sync that died mid-way may have appended a line twice), known versions only (AC-25).
function readStore(store) {
  const seen = new Set();
  const out = { events: [], duplicates: 0, skipped: 0, unreadable: 0, repeats: 0 };
  for (const file of walk(path.join(store, 'events')).filter((f) => f.endsWith('.jsonl')).sort()) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim())) {
      const found = classify(line, seen);
      if (typeof found === 'string') out[found]++;
      else out.events.push(found);
    }
  }
  out.events.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const deduped = dropRepeats(out.events);
  out.events = deduped.events;
  out.repeats = deduped.repeats;
  return out;
}

const taskKey = (event) => `${event.project}/${event.task}`;

// A reconciled move that a later reconcile puts straight back is the worktree moving under the task files —
// a branch checked out, a merge pulled in — not the task going backwards and forwards. Neither half counts.
// A session move in between ends the pair, because then somebody really did move the task.
function dropRoundTrips(moves) {
  const dropped = new Set();
  const open = new Map();
  moves.forEach((move, index) => {
    const task = taskKey(move);
    if (move.data?.source !== 'reconcile') {
      for (const key of [...open.keys()]) if (key.startsWith(`${task}|`)) open.delete(key);
      return;
    }
    const mirror = `${task}|${move.data?.to}|${move.data?.from}`;
    if (open.has(mirror)) {
      dropped.add(open.get(mirror));
      dropped.add(index);
      open.delete(mirror);
      return;
    }
    open.set(`${task}|${move.data?.from}|${move.data?.to}`, index);
  });
  return moves.filter((_, index) => !dropped.has(index));
}

// A status change pulled into several clones is reconciled on each of them. It counts only when no
// session saw the same move, and several reconciled copies of one move count once.
function statusMoves(events) {
  // Round trips first: the half that puts a task back often mirrors a move a session made earlier, and the
  // rule below would drop that half on its own, leaving the move out of the worktree looking like a regression.
  const moves = dropRoundTrips(events.filter((e) => e.type === 'task.status'));
  const inSession = new Set();
  const key = (e) => `${taskKey(e)}|${e.data?.from}|${e.data?.to}`;
  for (const e of moves) if (e.data?.source !== 'reconcile') inSession.add(key(e));
  const reconciled = new Set();
  return moves.filter((e) => {
    if (e.data?.source !== 'reconcile') return true;
    if (inSession.has(key(e)) || reconciled.has(key(e))) return false;
    reconciled.add(key(e));
    return true;
  });
}

const isBackward = (move) => move.data?.from in STATUS_RANK && move.data?.to in STATUS_RANK && STATUS_RANK[move.data.to] < STATUS_RANK[move.data.from];

// The model most of a task's events name; unknown never wins over a known one (R8: no guessing either way).
function modelOf(events) {
  const counts = new Map();
  for (const e of events) if (e.model && e.model !== 'unknown') counts.set(e.model, (counts.get(e.model) || 0) + 1);
  if (!counts.size) return 'unknown';
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

function fixesOf(event) {
  const value = event.data?.fixes;
  return (Array.isArray(value) ? value : [value]).filter((v) => typeof v === 'string' && v);
}

// The verdict says whether the work could be merged, so a round that found things and fixed them on the spot
// is a pass. What the task cost is the must-fix list itself: every one of those is something the plan, the
// standards or the task description should have prevented. That is the number worth ranking on.
const mustFixCount = (event) => (event.data?.findings || []).filter((f) => /^\s*must-fix\b/i.test(findingText(f))).length;

function summarizeTasks(events) {
  const tasks = new Map();
  const get = (key) => {
    if (!tasks.has(key)) tasks.set(key, { key, events: [], checks: 0, fails: 0, mustFix: 0, backward: 0, fixedBy: new Set() });
    return tasks.get(key);
  };
  for (const e of events.filter((x) => x.task)) {
    const task = get(taskKey(e));
    task.events.push(e);
    if (e.type === 'check.result') {
      task.checks++;
      if (e.data?.verdict === 'fail') task.fails++;
      task.mustFix += mustFixCount(e);
    }
    if (e.type === 'task.created') for (const target of fixesOf(e)) get(`${e.project}/${target}`).fixedBy.add(taskKey(e));
  }
  for (const move of statusMoves(events).filter((m) => m.task && isBackward(m))) get(taskKey(move)).backward++;
  for (const task of tasks.values()) {
    task.model = modelOf(task.events);
    task.score = task.mustFix + task.fails + task.backward + 2 * task.fixedBy.size;
  }
  return [...tasks.values()];
}

function byModel(tasks) {
  const rows = new Map();
  for (const t of tasks) {
    const row = rows.get(t.model) || { model: t.model, tasks: 0, checks: 0, fails: 0, mustFix: 0, mustFixTasks: 0, backwardTasks: 0, fixedTasks: 0 };
    row.tasks++;
    row.checks += t.checks;
    row.fails += t.fails;
    row.mustFix += t.mustFix;
    if (t.mustFix) row.mustFixTasks++;
    if (t.backward) row.backwardTasks++;
    if (t.fixedBy.size) row.fixedTasks++;
    rows.set(t.model, row);
  }
  return [...rows.values()].map((r) => ({ ...r, failRate: r.checks ? r.fails / r.checks : null })).sort((a, b) => b.tasks - a.tasks || a.model.localeCompare(b.model));
}

const ageDays = (iso, now) => (Number.isNaN(Date.parse(iso)) ? null : Math.floor((now - Date.parse(iso)) / DAY_MS));

// The newer of verifier.audit and readiness.snapshot says where a project stands (AC-23).
function byProject(events, now) {
  const projects = new Map();
  for (const e of events) {
    const p = projects.get(e.project) || { project: e.project, lastEventAt: null, readiness: null };
    p.lastEventAt = e.at;
    if (e.type === 'verifier.audit' || e.type === 'readiness.snapshot') p.readiness = e;
    projects.set(e.project, p);
  }
  return [...projects.values()].sort((a, b) => a.project.localeCompare(b.project)).map((p) => {
    const r = p.readiness;
    const outcome = !r ? null : r.type === 'readiness.snapshot' ? r.data?.outcome ?? null : r.data?.ok ? 'no disagreement' : 'refuted';
    return {
      project: p.project,
      level: r?.data?.level ?? null,
      outcome,
      source: r?.type ?? null,
      evidenceAgeDays: r ? ageDays(r.data?.generatedAt, now) : null,
      lastEventAt: p.lastEventAt,
    };
  });
}

const evalDraftCommand = (key) => `buaflow usage eval-draft --task ${key}`;

const cell = (value) => (value === null || value === undefined ? '—' : String(value).replace(/\|/g, '\\|'));
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');

function renderReport(result) {
  const { store, since, now, counts, models, projects, watch } = result;
  const pct = (v) => (v === null ? null : `${Math.round(v * 100)}%`);
  return [
    `# Buaflow usage report — ${now.slice(0, 10)}`,
    '',
    `- store: \`${store}\`${since ? ` · since ${since}` : ''}`,
    `- ${counts.events} event(s) from ${counts.projects} project(s) · ${counts.duplicates} duplicate(s) dropped · ${counts.repeats} repeat(s) of an event already recorded · skipped ${counts.skipped} with an unknown schema version${counts.unreadable ? ` · ${counts.unreadable} unreadable line(s)` : ''}`,
    '',
    '## By model',
    '',
    'A task\'s model is the one most of its events name. "unknown" means no event said.',
    'A must-fix is what `/check` had to catch, whether or not it was fixed before the verdict — the fail rate',
    'counts only the rounds that still could not be merged, so it hides the work a round fixed on the spot.',
    '',
    table(['model', 'tasks', '/check fail rate', 'must-fix raised', 'tasks with a must-fix', 'tasks moved backward', 'tasks fixed later (fixes:)'], models.map((m) => [m.model, m.tasks, m.failRate === null ? null : `${pct(m.failRate)} (${m.fails}/${m.checks})`, m.mustFix, m.mustFixTasks, m.backwardTasks, m.fixedTasks])),
    '',
    '## By project',
    '',
    table(['project', 'readiness', 'outcome', 'from', 'evidence age (days)', 'last event'], projects.map((p) => [p.project, p.level, p.outcome, p.source, p.evidenceAgeDays, p.lastEventAt?.slice(0, 10)])),
    '',
    '## Tasks worth a look',
    '',
    'Score = must-fix raised + failed /check + moves backward + 2 × tasks that name it in `fixes:`.',
    'A move the worktree made — a reconciled move a later reconcile puts straight back — is not a move backward.',
    '',
    watch.length ? table(['score', 'task', 'model', 'must-fix', 'failed /check', 'backward', 'fixed by', 'eval draft'], watch.map((t) => [t.score, t.key, t.model, t.mustFix, t.fails, t.backward, t.fixedBy.join(', ') || null, `\`${evalDraftCommand(t.key)}\``])) : '_None: no must-fix, no backward move, no fixes: link._',
    '',
  ].join('\n');
}

function machineConfig() {
  try { return JSON.parse(fs.readFileSync(usage.machineConfigFile(), 'utf8')); } catch { return null; }
}

// Other machines' events arrive by pull; offline or diverged, the clone is read as it is.
function pullQuietly(store) {
  try {
    execFileSync('git', ['pull', '--ff-only', '--quiet'], { cwd: store, stdio: 'ignore', windowsHide: true, timeout: 60 * 1000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  } catch { /* read what is here */ }
}

function report({ out = null, since = null, now = new Date(), pull = true } = {}) {
  const config = machineConfig();
  if (!config?.store) return { code: 1, summary: 'no central store on this machine', data: {}, warnings: [], errors: ['buaflow usage setup --store <path to your clone>'] };
  if (pull) pullQuietly(config.store);
  // Everything is read, so the reviewed count covers the whole store even when --since narrows the page.
  const all = readStore(config.store);
  const read = since ? { ...all, events: all.events.filter((e) => String(e.at) >= since) } : all;
  const tasks = summarizeTasks(read.events);
  const watch = tasks.filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .map((t) => ({ key: t.key, model: t.model, score: t.score, mustFix: t.mustFix, fails: t.fails, backward: t.backward, fixedBy: [...t.fixedBy].sort() }));
  const result = {
    store: config.store,
    since,
    now: now.toISOString(),
    counts: { events: read.events.length, projects: new Set(read.events.map((e) => e.project)).size, duplicates: read.duplicates, repeats: read.repeats, skipped: read.skipped, unreadable: read.unreadable },
    models: byModel(tasks),
    projects: byProject(read.events, now.getTime()),
    watch,
  };
  const text = renderReport(result);
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(path.resolve(out), text);
  }
  // Reviewing is what the session notice counts from (AC-27): how many events existed, not when they happened.
  fs.writeFileSync(usage.machineConfigFile(), `${JSON.stringify({ ...config, lastReviewAt: result.now, reviewedEvents: all.events.length }, null, 2)}\n`);
  const skippedNote = read.skipped ? ` · skipped ${read.skipped} with an unknown schema version` : '';
  return { code: 0, summary: `${read.events.length} event(s), ${watch.length} task(s) worth a look${skippedNote}${out ? ` → ${out}` : ''}`, data: { ...result, text: out ? undefined : text, out }, warnings: [], errors: [] };
}

function describe(e) {
  const d = e.data || {};
  if (e.type === 'task.status') return `${d.from} → ${d.to}${d.source === 'reconcile' ? ' (outside a session)' : ''}`;
  if (e.type === 'check.result') return `${d.verdict}${d.findings?.length ? ` · ${d.findings.length} finding(s)` : ''}`;
  if (e.type === 'plan.approved') return `approved by ${d.approvedBy}`;
  if (e.type === 'task.done') return `commit ${d.commit ?? '—'} · sessions ${d.sessions ?? '—'}`;
  if (e.type === 'task.created') return `${d.acceptance?.length ?? 0} AC${d.fixes ? ` · fixes ${fixesOf(e).join(', ')}` : ''}`;
  return d.path || '';
}

// One task from intent to done (AC-24): its own events plus the intent its task file names.
function show(target, { pull = true } = {}) {
  const config = machineConfig();
  if (!config?.store) return { code: 1, summary: 'no central store on this machine', data: {}, warnings: [], errors: ['buaflow usage setup --store <path to your clone>'] };
  if (pull) pullQuietly(config.store);
  const [project, task] = target.split('/');
  const { events } = readStore(config.store);
  const own = events.filter((e) => e.project === project && e.task === task);
  if (!own.length) return { code: 1, summary: `no events for ${target}`, data: { target }, warnings: [], errors: [`${target} is not in ${config.store}`] };
  const created = own.find((e) => e.type === 'task.created');
  const intentPath = created ? String(frontmatter(created.data?.content || '')?.intent || '').trim() : '';
  const intent = intentPath ? events.filter((e) => e.project === project && e.type === 'intent.opened' && e.data?.path === intentPath) : [];
  const timeline = [...intent, ...own].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const text = [`# ${target}`, '', ...timeline.map((e) => `- ${e.at}  ${e.type.padEnd(18)} ${e.model.padEnd(20)} ${describe(e)}`), ''].join('\n');
  return { code: 0, summary: `${timeline.length} event(s) for ${target}`, data: { target, events: timeline, text }, warnings: [], errors: [] };
}

// The text under one "## heading" of a document, up to the next "## ".
function section(markdown, heading) {
  const lines = String(markdown || '').split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`## ${heading}`));
  if (start === -1) return '';
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trim();
}

function nextCaseId(dirs) {
  const numbers = dirs.flatMap((dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []))
    .map((name) => /^EV-(\d+)\.json$/.exec(name)?.[1]).filter(Boolean).map(Number);
  return `EV-${String(Math.max(0, ...numbers) + 1).padStart(3, '0')}`;
}

// Where the task went wrong decides which skill the case exercises (design: ร่าง eval case).
function skillsUnderTest(task) {
  const tests = new Set();
  if (task?.fails || task?.fixedBy.size) tests.add('core/skills/check.md');
  if (task?.backward) tests.add('core/skills/plan.md');
  if (!tests.size) tests.add('core/skills/task.md');
  return [...tests];
}

function gitUser(root) {
  try {
    return execFileSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
  } catch {
    return '';
  }
}

// Short AC ids alone ("AC-1") would fail the harness's 10-character floor; say what they are instead.
const atLeastTen = (text, lead) => (String(text).length >= 10 ? String(text) : `${lead}: ${text}`);
const findingText = (finding) => (typeof finding === 'string' ? finding : JSON.stringify(finding));

// AC-21: a real task becomes a draft eval case. Structurally valid on purpose, and plainly a draft on purpose:
// a person edits the prompt and criteria, then moves it into claude-setup/evals/ (EV-006 cycle).
function evalDraft(start, target, { out = null, pull = true, author = null } = {}) {
  const repo = buaflowRoot(start);
  if (!repo) {
    return { code: 1, summary: 'eval-draft runs in the Buaflow repository', data: {}, warnings: [], errors: ['a draft\'s tests point at core/skills/…, which only the Buaflow repository has'] };
  }
  const config = machineConfig();
  if (!config?.store) return { code: 1, summary: 'no central store on this machine', data: {}, warnings: [], errors: ['buaflow usage setup --store <path to your clone>'] };
  if (pull) pullQuietly(config.store);
  const [project, taskId] = target.split('/');
  const { events } = readStore(config.store);
  const own = events.filter((e) => e.project === project && e.task === taskId);
  if (!own.length) return { code: 1, summary: `no events for ${target}`, data: { target }, warnings: [], errors: [`${target} is not in ${config.store}`] };

  const created = own.find((e) => e.type === 'task.created');
  const meta = frontmatter(created?.data?.content || '') || {};
  const intentPath = String(meta.intent || '').trim();
  const intent = intentPath ? events.find((e) => e.project === project && e.type === 'intent.opened' && e.data?.path === intentPath) : null;
  const plan = own.find((e) => e.type === 'plan.approved');
  const summary = summarizeTasks(events).find((t) => t.key === target);

  // At most 98, so a task with a very long AC list still leaves room for what must not happen (the schema needs both).
  const mustHappen = (created?.data?.acceptance || []).slice(0, 98).map((ac) => atLeastTen(ac, 'ต้องครบตามเกณฑ์'));
  // A round that found must-fix items and fixed them before the verdict still passes, and those items are
  // exactly what the case must stop happening again — take them whatever the verdict said. Two rounds often
  // repeat a finding word for word; the same sentence twice is one criterion.
  const mustNot = [...new Set(own.filter((e) => e.type === 'check.result')
    .flatMap((e) => (e.data?.findings || []).filter((f) => e.data?.verdict === 'fail' || /^\s*must-fix\b/i.test(findingText(f))))
    .map((f) => `ห้ามเกิดซ้ำ: ${findingText(f)}`))];
  const criteria = [
    ...(mustHappen.length ? mustHappen : ['<แก้ก่อนใช้: สิ่งที่ต้องเกิด — task นี้ไม่มี AC ที่บันทึกไว้>']).map((statement) => ({ kind: 'must-happen', statement })),
    ...(mustNot.length ? mustNot : ['<แก้ก่อนใช้: สิ่งที่ห้ามเกิดในงานนี้ — ไม่มี /check ที่ตกให้คัดมา>']).map((statement) => ({ kind: 'must-not-happen', statement })),
  ].slice(0, 99).map((criterion, index) => ({ id: `C${index + 1}`, ...criterion }));

  const dir = out ? path.resolve(start, out) : path.join(config.store, 'evals', 'drafts');
  const id = nextCaseId([path.join(repo, 'claude-setup', 'evals'), dir]);
  const evalCase = {
    $schema: 'https://buaflow.dev/schemas/eval-case-v1.json',
    schemaVersion: '1.0',
    _: `ร่างจากงานจริง ${target} (buaflow usage eval-draft) — แก้ prompt และ criteria ให้เป็นคำถามที่ทดสอบ skill ได้จริง แทนข้อความ <แก้ก่อนใช้…> ทุกจุด แล้วค่อยย้ายไป claude-setup/evals/ · คนเขียนเคสห้ามเป็นคนตรวจ`,
    id,
    title: atLeastTen(`ร่างจาก ${target}: ${meta.title || taskId}`, 'ร่างจากงานจริง'),
    authoredBy: author || gitUser(repo) || 'unknown author',
    origin: 'observed-failure',
    observedIn: target,
    tests: skillsUnderTest(summary),
    setup: [
      ...(plan ? [`plan ที่อนุมัติแล้ว: ${plan.data?.path || 'ดูใน usage show'} (โดย ${plan.data?.approvedBy || 'ไม่ทราบ'})`] : []),
      `บริบทเต็มของงานนี้: buaflow usage show ${target}`,
    ],
    prompt: atLeastTen(intent?.data?.content || section(created?.data?.content, 'ทำอะไร') || meta.title || taskId, 'งานจริงจาก'),
    criteria,
    passWhen: { minScore: 0.8 },
  };
  const checked = require('./eval-harness.js').validateCase(evalCase, { root: repo, expectedId: id });
  if (!checked.ok) return { code: 1, summary: `the draft for ${target} does not validate`, data: { draft: evalCase }, warnings: [], errors: checked.errors };
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.json`);
  fs.writeFileSync(file, `${JSON.stringify(evalCase, null, 2)}\n`);
  return {
    code: 0,
    summary: `draft ${id} for ${target} → ${file}`,
    data: { id, file, draft: evalCase },
    warnings: ['a draft, not a case: edit the prompt and criteria, then move it to claude-setup/evals/'],
    errors: [],
  };
}

// The command a report prints is run from wherever the owner stands inside the Buaflow repository.
function buaflowRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (isBuaflowRepo(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function isBuaflowRepo(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name === 'buaflow' && fs.existsSync(path.join(root, 'development', 'state.json'));
  } catch {
    return false;
  }
}

// AC-27: opening the Buaflow repository on a machine with a store says how much is waiting to be reviewed.
// Counted by arrival, not by each event's own time: a laptop that syncs a week late still brings new events.
// The store only grows, so what is there now minus what the last report saw is what arrived since.
// Nothing new → no line, so the line keeps meaning something (EV-011.5 decision).
function reviewNotice(root) {
  if (!isBuaflowRepo(root)) return null;
  const config = machineConfig();
  if (!config?.store) return null;
  const reviewed = Number.isInteger(config.reviewedEvents) ? config.reviewedEvents : 0;
  const fresh = Math.max(0, readStore(config.store).events.length - reviewed);
  if (!fresh) return null;
  const last = config.lastReviewAt ? config.lastReviewAt.slice(0, 10) : 'ยังไม่เคย review';
  return `มี event ใหม่ ${fresh} รายการในที่เก็บกลางตั้งแต่ review ล่าสุด (${last}) — buaflow usage report`;
}

module.exports = { evalDraft, report, reviewNotice, show };
