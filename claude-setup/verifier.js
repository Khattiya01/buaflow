#!/usr/bin/env node
/**
 * verifier — independent verification of a readiness manifest (BC-006)
 *
 *   node claude-setup/verifier.js --root .
 *   node claude-setup/verifier.js --root . --execute
 *   node claude-setup/verifier.js --root . --execute --level R3 --json
 *
 * ทำไมต้องมี: readiness.json ถูกเขียนโดย "คนที่สร้างงาน" เอง — builder ประกาศว่า control ผ่าน
 * แล้วแนบ evidence เช่น `npm test` ไว้ ส่วน readiness.js ตรวจแค่ว่า "ประกาศถูกรูปแบบไหม" และ
 * ไฟล์ที่อ้างมีอยู่จริงไหม แต่ไม่เคยรันคำสั่งนั้นซ้ำเลย แปลว่าหลักฐานของ command evidence
 * ทั้งหมดคือ "คำพูดของ builder" ซึ่งขัดกับ principle ข้อ 1 ของ roadmap โดยตรง
 *
 * ไฟล์นี้ตัดสินใหม่จาก artifact และผลการรันจริงเท่านั้น และ **ไม่เคยใช้ control.status ของ
 * manifest เป็นข้อมูลเข้าในการตัดสินของตัวเอง** — มันตัดสินก่อน แล้วค่อยเอาไปเทียบกับสิ่งที่
 * builder อ้าง สิ่งที่รายงานออกมาคือ "ตรงกันไหม" ไม่ใช่ "เชื่อตามไหม"
 *
 * คำตัดสินมีสามค่า ไม่ใช่สอง:
 *
 *   confirmed     ทำซ้ำได้จริงจากที่นี่
 *   refuted       ทำซ้ำแล้วไม่จริง — คำสั่ง exit ไม่เป็นศูนย์ หรือไฟล์หลักฐานหายไป/ว่างเปล่า
 *   unverifiable  ตรวจจากที่นี่ไม่ได้ — URL ภายนอก, human attestation, ไม่ได้ส่ง --execute,
 *                 หรือคำสั่งที่ไม่มีวันจบ (เช่น dev server)
 *
 * `unverifiable` ต้องแยกจาก `confirmed` เสมอ ไม่ใช่ปัดเป็นผ่าน — "เรายังไม่ได้ตรวจ" กับ
 * "เราตรวจแล้วจริง" เป็นคนละเรื่อง และการยุบสองอย่างนี้เข้าด้วยกันคือวิธีที่ระบบตรวจสอบตายเงียบ ๆ
 *
 * `refuted` จาก command หมายถึง "ทำซ้ำไม่ได้ **ที่นี่**" ไม่ใช่ "ผู้สร้างโกหก" — evidence ที่ต้องมี
 * database, แอปที่ build แล้ว หรือ browser จะตกในเครื่องที่ยังไม่ได้เตรียม (เจอจริงตอนรันไฟล์นี้กับ
 * reference-apps/nextjs-postgres-crud ครั้งแรก) ต้องดูสภาพแวดล้อมก่อนสรุปว่าคำประกาศนั้นเท็จ
 *
 * ไม่รันคำสั่งถ้าไม่ส่ง --execute: ค่าเริ่มต้นจึงปลอดภัย และ command evidence จะเป็น
 * `unverifiable` แทนที่จะเป็น `confirmed` ซึ่งยังคงหลักการเดิมไว้ครบ — ไม่มีอะไรถูกนับว่าผ่าน
 * เพราะ builder บอกว่าผ่าน
 *
 * exit 0 = ไม่มี control ไหนถูกหักล้าง | exit 1 = มีการหักล้าง | exit 2 = input ผิด
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { LEVEL_ORDER, controlsFor, validateManifest } = require('./readiness.js');

const DEFAULT_TIMEOUT_MS = 300000;

function insideRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function defaultRunner(command, { cwd, timeoutMs }) {
  // shell: true because evidence commands are written the way a person would type them,
  // pipes and && included. The trust boundary is stated in --help and in the standard: this
  // runs commands out of a file in the project being verified, at the same trust level as
  // that project's own npm scripts. It is not a sandbox for untrusted input.
  const result = spawnSync(command, {
    cwd,
    shell: true,
    timeout: timeoutMs,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status,
    timedOut: result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM',
    stderr: result.stderr || '',
    stdout: result.stdout || '',
    error: result.error && result.error.code !== 'ETIMEDOUT' ? result.error.message : null,
  };
}

function lastLine(text) {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.length ? lines[lines.length - 1].trim().slice(0, 200) : '';
}

function verifyEvidence(item, options) {
  const { root, execute, timeoutMs, runner } = options;

  if (item.type === 'manual') {
    return { verdict: 'unverifiable', reason: 'a human attestation cannot be independently reproduced from here' };
  }

  if (item.type === 'url') {
    // No network by design: a verifier that depends on the internet gives different answers
    // on different days, and an external page is somebody else's attestation either way.
    return { verdict: 'unverifiable', reason: 'an external URL is another system\'s attestation and is not fetched by this verifier' };
  }

  if (item.type === 'file') {
    if (path.isAbsolute(item.value)) {
      return { verdict: 'refuted', reason: 'file evidence must be relative to the project root' };
    }
    const resolved = path.resolve(root, item.value);
    if (!insideRoot(root, resolved)) {
      return { verdict: 'refuted', reason: 'file evidence escapes the project root' };
    }
    if (!fs.existsSync(resolved)) {
      return { verdict: 'refuted', reason: 'declared file evidence does not exist' };
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(resolved);
      return entries.length
        ? { verdict: 'confirmed', reason: `directory exists with ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}` }
        : { verdict: 'refuted', reason: 'directory evidence is empty, so it attests to nothing' };
    }
    if (stat.size === 0) {
      // An empty file passes an existence check and proves nothing. This is the cheapest way
      // for a placeholder to masquerade as evidence, so it is refuted rather than confirmed.
      return { verdict: 'refuted', reason: 'file evidence is empty, so it attests to nothing' };
    }
    return { verdict: 'confirmed', reason: `file exists (${stat.size} bytes)` };
  }

  if (item.type === 'command') {
    if (!execute) {
      return { verdict: 'unverifiable', reason: 'commands are only re-executed with --execute' };
    }
    const outcome = runner(item.value, { cwd: root, timeoutMs });
    if (outcome.timedOut) {
      // A dev server is the common case. Exit status can never be evidence for a command
      // that is not supposed to exit, and saying so is more useful than a false failure.
      return {
        verdict: 'unverifiable',
        reason: `did not terminate within ${Math.round(timeoutMs / 1000)}s; a command that is not meant to exit cannot serve as pass/fail evidence`,
      };
    }
    if (outcome.error) {
      return { verdict: 'refuted', reason: `could not run: ${outcome.error}` };
    }
    if (outcome.status === 0) {
      return { verdict: 'confirmed', reason: 'command exited 0' };
    }
    const tail = lastLine(outcome.stderr) || lastLine(outcome.stdout);
    return {
      verdict: 'refuted',
      reason: `did not reproduce in this environment — exited ${outcome.status}${tail ? `: ${tail}` : ''}`,
    };
  }

  return { verdict: 'unverifiable', reason: `unsupported evidence type "${item.type}"` };
}

function verifyManifest(manifest, options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const level = options.level || manifest?.targetLevel;
  const execute = options.execute === true;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const runner = options.runner || defaultRunner;

  // The declaration check still runs, because a manifest that does not even parse as a
  // manifest is not something to re-execute. But its verdict is kept separate: a manifest
  // can be well-formed and still be wrong about what it claims, which is the whole point.
  const declaration = validateManifest(manifest, { root, level: options.level || undefined });

  const required = controlsFor(level) || [];
  const verdicts = [];
  const counts = { confirmed: 0, refuted: 0, unverifiable: 0 };
  const disagreements = [];

  for (const controlId of required) {
    const control = manifest?.controls?.[controlId];
    if (!control || typeof control !== 'object' || Array.isArray(control)) {
      verdicts.push({
        control: controlId,
        claimed: null,
        verdict: 'refuted',
        reason: 'the manifest makes no claim about a control this level requires',
        evidence: [],
      });
      counts.refuted++;
      continue;
    }

    if (control.status === 'not-applicable') {
      // Applicability is a judgement about the product, not about an artifact, so a machine
      // re-running commands has nothing to say about it. Reporting it as confirmed would be
      // this verifier claiming an authority it does not have.
      verdicts.push({
        control: controlId,
        claimed: control.status,
        verdict: 'unverifiable',
        reason: 'applicability is a human judgement; this verifier re-runs evidence and does not re-decide scope',
        evidence: [],
      });
      counts.unverifiable++;
      continue;
    }

    const evidence = (Array.isArray(control.evidence) ? control.evidence : []).map((item) => ({
      type: item?.type,
      value: item?.value,
      ...verifyEvidence(item || {}, { root, execute, timeoutMs, runner }),
    }));

    let verdict;
    let reason;
    if (evidence.length === 0) {
      verdict = 'refuted';
      reason = 'no evidence is attached at all';
    } else if (evidence.some((e) => e.verdict === 'refuted')) {
      verdict = 'refuted';
      reason = evidence.filter((e) => e.verdict === 'refuted').map((e) => e.reason).join('; ');
    } else if (evidence.some((e) => e.verdict === 'confirmed')) {
      verdict = 'confirmed';
      reason = `${evidence.filter((e) => e.verdict === 'confirmed').length} of ${evidence.length} evidence item(s) reproduced here`;
    } else {
      verdict = 'unverifiable';
      const reasons = [...new Set(evidence.map((e) => e.reason))];
      reason = reasons.length ? reasons.join('; ') : 'nothing attached to this control can be checked from here';
    }

    counts[verdict]++;
    verdicts.push({ control: controlId, claimed: control.status, verdict, reason, evidence });

    // The independent part: the claim is compared to the verdict, and the verdict was
    // reached without reading the claim.
    if (control.status === 'pass' && verdict === 'refuted') {
      disagreements.push(`${controlId}: claimed pass, but ${reason}`);
    }
  }

  return {
    ok: counts.refuted === 0,
    level,
    executed: execute,
    counts,
    disagreements,
    verdicts,
    declaration: { ok: declaration.ok, errors: declaration.errors },
  };
}

function parseArgs(argv) {
  const options = {
    file: 'docs/evidence/readiness.json',
    root: process.cwd(),
    json: false,
    level: null,
    execute: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--execute') options.execute = true;
    else if (arg === '--file') options.file = argv[++index];
    else if (arg === '--root') options.root = argv[++index];
    else if (arg === '--level') options.level = argv[++index];
    else if (arg === '--timeout') options.timeoutMs = Number(argv[++index]) * 1000;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.file) throw new Error('--file requires a path');
  if (!options.root) throw new Error('--root requires a path');
  if (options.level && !LEVEL_ORDER.includes(options.level)) throw new Error(`unsupported level: ${options.level}`);
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('--timeout requires a positive number of seconds');
  return options;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`verifier: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log([
      'Usage: node claude-setup/verifier.js [--root path] [--file path] [--level R0-R4]',
      '                                     [--execute] [--timeout seconds] [--json]',
      '',
      'Re-checks a readiness manifest from artifacts and command output alone, and never',
      'from the builder\'s own declaration. Reports confirmed / refuted / unverifiable.',
      '',
      '--execute re-runs the declared command evidence. It runs those commands with a shell,',
      'at the same trust level as the project\'s own scripts; do not point it at a project you',
      'would not already run `npm test` in.',
      '',
      'Exit codes: 0 nothing refuted, 1 at least one control refuted, 2 invalid input',
    ].join('\n'));
    return 0;
  }

  const root = path.resolve(options.root);
  const manifestPath = path.resolve(root, options.file);
  if (!insideRoot(root, manifestPath)) {
    console.error('verifier: manifest path must stay inside the project root');
    return 2;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    console.error(`verifier: cannot read ${path.relative(root, manifestPath)}: ${error.message}`);
    return 2;
  }

  const result = verifyManifest(manifest, {
    root,
    level: options.level || undefined,
    execute: options.execute,
    timeoutMs: options.timeoutMs,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const { confirmed, refuted, unverifiable } = result.counts;
    console.log(
      `verifier ${result.level}: ${result.ok ? 'NO DISAGREEMENT' : 'REFUTED'} `
      + `(${confirmed} confirmed, ${refuted} refuted, ${unverifiable} unverifiable`
      + `${options.execute ? '' : '; commands not re-run — pass --execute'})`
    );
    for (const line of result.disagreements) console.log(`  refuted: ${line}`);
    if (result.disagreements.length && options.execute) {
      console.log('  note: a refuted command means it did not reproduce HERE. Evidence that needs a database,');
      console.log('        a built app or a browser will fail in a bare checkout — check the environment before');
      console.log('        concluding the claim was false.');
    }
    for (const verdict of result.verdicts) {
      if (verdict.verdict === 'refuted' && verdict.claimed !== 'pass') {
        console.log(`  refuted: ${verdict.control} (claimed ${verdict.claimed ?? 'nothing'}): ${verdict.reason}`);
      }
    }
    for (const verdict of result.verdicts) {
      if (verdict.verdict === 'unverifiable') console.log(`  unverified: ${verdict.control}: ${verdict.reason}`);
    }
    if (!result.declaration.ok) {
      console.log(`  note: the manifest also fails its own declaration contract (${result.declaration.errors.length} error(s)); run readiness.js for those`);
    }
  }

  return result.ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { DEFAULT_TIMEOUT_MS, parseArgs, verifyEvidence, verifyManifest };
