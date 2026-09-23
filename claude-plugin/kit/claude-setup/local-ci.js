#!/usr/bin/env node
/**
 * local-ci.js — CI จาก clean checkout บนเครื่องตัวเอง แทน hosted CI ที่ยังใช้ไม่ได้
 *
 *   node buaflow/claude-setup/local-ci.js --root .
 *   buaflow ci
 *
 * ทำไมต้องมี (EV-009): R2 ต้องการ "CI รันชุดตรวจมาตรฐานจาก clean checkout" · trial แรกเขียน workflow
 * ครบแล้วแต่ GitHub ไม่ยอมเริ่ม job เพราะ billing ของ account — เจ้าของโปรเจกต์เลือกไม่จ่าย ซึ่งเป็น
 * การตัดสินใจที่สมเหตุผล และ kit ไม่ควรทำให้ R2 เป็นไปไม่ได้เพราะเรื่องนั้น
 *
 * สิ่งที่ R2 ต้องการจริง ๆ ไม่ใช่ "GitHub" แต่คือสองอย่าง: (1) รันจาก **checkout ที่สะอาด** ไม่ใช่
 * working tree ที่มี node_modules, .env และไฟล์ค้างของคนเขียน (2) มี **บันทึก** ที่ตรวจกลับได้ว่ารัน commit
 * ไหน ผลอะไร · ไฟล์นี้ทำทั้งสองอย่างบนเครื่อง:
 *
 *   1. git clone ของ HEAD ไปที่โฟลเดอร์ชั่วคราว — ไม่มีอะไรจาก working tree ติดไปนอกจากที่ commit แล้ว
 *   2. รัน commands.ciSetup จาก .claude/stack.json (ติดตั้ง dependency, คัดลอก env) ·
 *      {source} ในคำสั่งถูกแทนด้วย path ของโปรเจกต์ต้นทาง — ใช้คัดลอกไฟล์ที่ไม่อยู่ใน git อย่าง .env
 *      ซึ่งใน hosted CI จะมาจาก secrets
 *   3. รัน node .claude/gate.js ของ clone นั้น
 *   4. เขียน docs/evidence/ci-run.json — รูปแบบเดียวกับ record ของ GitHub Actions ที่ reference app ใช้
 *      แต่ provider เป็น "local-clean-checkout" เสมอ ใครอ่านก็รู้ว่าไม่ได้มาจาก hosted runner
 *
 * สิ่งที่ local CI **ไม่ใช่**: หลักฐานที่คนอื่นเป็นคนรัน · มันรันบนเครื่องเดียวกับที่เขียนโค้ด
 * จึงไม่จับ "ผ่านเฉพาะเครื่องฉัน" ที่มาจาก tool/version ของเครื่อง (clean checkout จับได้แค่ไฟล์ที่ลืม commit)
 * ⇒ บันทึก os/node ของเครื่องไว้ในหลักฐาน และสลับไป hosted CI ได้ทันทีที่มี (ciMode: required)
 *
 * exit 0 = gate ผ่านบน clean checkout · 1 = ไม่ผ่าน (record ยังถูกเขียน — ความล้มเหลวก็เป็นหลักฐาน)
 * exit 2 = input ผิด / ไม่ใช่ git repo · ไม่มี dependency — Node ล้วน
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function parseArgs(argv) {
  const options = { root: process.cwd(), out: 'docs/evidence/ci-run.json', keep: false, json: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--root') options.root = argv[++index];
    else if (arg === '--out') options.out = argv[++index];
    else if (arg === '--keep') options.keep = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.root) throw new Error('--root requires a path');
  if (!options.out) throw new Error('--out requires a path');
  return options;
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { status: result.error ? null : result.status, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim() };
}

function tail(text, lines = 12) {
  return String(text || '').split(/\r?\n/).filter((line) => line.trim()).slice(-lines).join('\n');
}

function readStack(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, '.claude', 'stack.json'), 'utf8')); } catch { return {}; }
}

function runStep(name, command, cwd, env) {
  const started = Date.now();
  const result = spawnSync(command, { cwd, env, shell: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
  return {
    name,
    command,
    exitCode: result.status,
    durationSeconds: Math.round((Date.now() - started) / 100) / 10,
    outputTail: tail(`${result.stdout || ''}\n${result.stderr || ''}`),
  };
}

function localCi(rootInput, options = {}) {
  const root = path.resolve(rootInput);
  const top = git(['rev-parse', '--show-toplevel'], root);
  if (top.status !== 0) return { error: 'not inside a git work tree — a clean checkout needs a commit to check out' };
  const commit = git(['rev-parse', 'HEAD'], root).stdout;
  const dirty = git(['status', '--porcelain'], root).stdout.split('\n').filter(Boolean);
  const subdir = path.relative(path.resolve(top.stdout), root);

  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'buaflow-local-ci-'));
  const startedAt = new Date();
  const steps = [];
  try {
    const clone = git(['clone', '--quiet', '--no-hardlinks', path.resolve(top.stdout), workdir], os.tmpdir());
    steps.push({ name: 'clean checkout', command: `git clone ${commit.slice(0, 12)}`, exitCode: clone.status, durationSeconds: 0, outputTail: tail(clone.stderr) });
    if (clone.status === 0) {
      const checkout = git(['checkout', '--quiet', '--detach', commit], workdir);
      if (checkout.status !== 0) steps.push({ name: 'checkout commit', command: `git checkout ${commit}`, exitCode: checkout.status, durationSeconds: 0, outputTail: tail(checkout.stderr) });
    }
    const project = path.join(workdir, subdir);
    const stack = readStack(project);
    const env = { ...process.env, CLAUDE_PROJECT_DIR: project, CI: 'true', BUAFLOW_LOCAL_CI: '1' };
    delete env.VERIFY_COMMAND;
    if (steps.every((s) => s.exitCode === 0)) {
      const setup = stack.commands?.ciSetup;
      if (setup) steps.push(runStep('setup (commands.ciSetup)', setup.split('{source}').join(root.replace(/\\/g, '/')), project, env));
      if (steps.every((s) => s.exitCode === 0)) {
        if (!fs.existsSync(path.join(project, '.claude', 'gate.js'))) {
          steps.push({ name: 'gate', command: 'node .claude/gate.js', exitCode: 1, durationSeconds: 0, outputTail: '.claude/gate.js is not committed — the gate has to be part of the checkout to run from one' });
        } else {
          steps.push(runStep('gate', `"${process.execPath}" .claude/gate.js`, project, env));
        }
      }
    }
  } finally {
    if (!options.keep) fs.rmSync(workdir, { recursive: true, force: true, maxRetries: 3 });
  }

  const completedAt = new Date();
  const success = steps.length > 0 && steps.every((s) => s.exitCode === 0) && steps.some((s) => s.name === 'gate');
  return {
    _: 'Record of a local clean-checkout CI run written by buaflow ci (claude-setup/local-ci.js). It ran on the developer\'s machine, not a hosted runner: it proves the committed tree passes the gate from scratch, not that another machine agrees.',
    generatedAt: completedAt.toISOString(),
    provider: 'local-clean-checkout',
    workflow: 'node .claude/gate.js on a fresh git clone',
    commit,
    conclusion: success ? 'success' : 'failure',
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationSeconds: Math.round((completedAt - startedAt) / 1000),
    uncommittedChangesNotIncluded: dirty.length,
    machine: { platform: `${os.platform()} ${os.release()}`, arch: os.arch(), node: process.version },
    steps,
  };
}

function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(argv); } catch (error) {
    console.error(`local-ci: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node local-ci.js [--root path] [--out docs/evidence/ci-run.json] [--keep] [--json]');
    return 0;
  }
  const root = path.resolve(options.root);
  const out = path.resolve(root, options.out);
  const relative = path.relative(root, out);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    console.error('local-ci: --out must stay inside the project root');
    return 2;
  }
  const record = localCi(root, options);
  if (record.error) {
    console.error(`local-ci: ${record.error}`);
    return 2;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  if (options.json) console.log(JSON.stringify(record, null, 2));
  else {
    console.log(`local-ci: ${record.conclusion.toUpperCase()} — ${record.commit.slice(0, 12)} from a clean checkout in ${record.durationSeconds}s`);
    for (const step of record.steps) console.log(`  ${step.exitCode === 0 ? 'pass' : 'FAIL'}  ${step.name} (${step.durationSeconds}s)`);
    if (record.uncommittedChangesNotIncluded) console.log(`  note: ${record.uncommittedChangesNotIncluded} uncommitted change(s) were not part of this run`);
    const failed = record.steps.find((s) => s.exitCode !== 0);
    if (failed) console.log(`\n${failed.outputTail}`);
    console.log(`  record: ${relative.replace(/\\/g, '/')}`);
  }
  return record.conclusion === 'success' ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { localCi, parseArgs };
