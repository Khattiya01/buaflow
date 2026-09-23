#!/usr/bin/env node
/**
 * benchmark.js — Production-Qualified App benchmark (EV-002)
 *
 *   node claude-setup/benchmark.js --root reference-apps/nextjs-postgres-crud
 *   node claude-setup/benchmark.js --root app-a --root app-b --root ../outside-project --json
 *   buaflow benchmark --root .
 *
 * ทำไมต้องมี: north-star metric นับ "แอปที่ Production-Qualified" แต่ก่อนหน้านี้ไม่มีอะไรนิยาม
 * คำนั้นเป็นตัวเลขได้ นอกจาก readiness R3 ที่ผ่าน/ไม่ผ่าน — ซึ่งบอกไม่ได้ว่าแอปที่ไม่ผ่าน
 * ห่างแค่ไหน และตัดสินจาก manifest ที่ผู้สร้างเขียนเอง ไฟล์นี้ให้คะแนนสามมิติที่ roadmap กำหนด
 * (functional · engineering · operations) จาก artifact ที่มีอยู่แล้วเท่านั้น
 *
 * กติกาที่ทำให้ตัวเลขนี้เชื่อได้:
 *
 *   1. ไม่มีช่องให้ใครพิมพ์ตัวเลข — ทุกคะแนนถูก derive จาก readiness manifest, คำตัดสินของ
 *      verifier.js (อิสระจาก status ที่ประกาศ), probe ของ assess.js, ตัวตรวจ EP-002..007
 *      และ eval-harness ทุกครั้งที่อ่าน
 *   2. คำประกาศของผู้สร้างไม่เคยได้คะแนนเต็มเอง — control ที่ประกาศ pass ได้ 1.0 ก็ต่อเมื่อ
 *      มีหลักฐานอย่างน้อยหนึ่งชิ้นที่ verifier ยืนยันได้จากที่นี่ (หรือ probe ยืนยันเอง) ·
 *      ประกาศ pass แต่หลักฐานตรวจจากที่นี่ไม่ได้ = 0.5 · หลักฐานมีแต่ manual (เช่น screenshot)
 *      = 0 ตามที่ EV-002 ระบุว่า screenshot อย่างเดียวไม่นับ · ถูกหักล้าง = 0
 *   3. ไม่มี manifest ก็ยังให้คะแนนได้ — probe ของ assess.js เป็นฐาน (pass 1.0 · pending 0.5 ·
 *      fail 0) ทำให้โปรเจกต์ที่ไม่ได้เกิดจาก Buaflow ถูกวัดด้วยคำสั่งเดียวกัน
 *   4. ไม่มี branch ตามแอป — ของที่ไม่มี (ไม่มี security-baseline.json, ไม่มี eval) ได้ 0
 *      เหมือนกันทุกแอป เพราะ "ไม่มีหลักฐาน" คือคำตอบ ไม่ใช่ข้อยกเว้น · ยกเว้นเดียวคือ
 *      not-applicable ที่ readiness อนุญาตและมีเหตุผล ซึ่งถูกตัดออกจากตัวหาร
 *
 * Production-Qualified = readiness R3 ผ่านการตรวจรูปแบบ + verifier ไม่หักล้างอะไรเลย +
 * ทุกมิติได้อย่างน้อย QUALIFY_FLOOR · ทั้งสามข้อต้องจริงพร้อมกัน และรายงานเหตุผลที่ไม่ผ่านทุกข้อ
 *
 * ไม่รันคำสั่งของโปรเจกต์ (ไม่มี --execute) — benchmark ต้องปลอดภัยพอจะชี้ไปที่ repo ไหนก็ได้
 * exit 0 = ให้คะแนนเสร็จ (ไม่ว่าจะผ่านหรือไม่) · exit 2 = input ผิด
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateManifest, CONDITIONAL } = require('./readiness.js');
const { verifyManifest } = require('./verifier.js');
const { assess } = require('./assess.js');
const { validateCase, validateRun, gradeRun } = require('./eval-harness.js');

const KIT_ROOT = path.resolve(__dirname, '..');
const QUALIFY_FLOOR = 0.8;

// Which dimension each R0–R3 control belongs to. Every R3 control is in exactly one, so the
// three dimensions together cover the whole Deployment-Ready Contract.
const DIMENSIONS = {
  functional: ['start-path', 'primary-flow', 'build', 'verification', 'requirements-traceability', 'persistence', 'access-control', 'end-to-end-tests'],
  engineering: ['version-control', 'automated-tests', 'ci', 'dependency-scan', 'secrets-scan', 'security-controls', 'sbom'],
  operations: ['deployment-package', 'runtime-config', 'database-migration', 'rollback', 'observability', 'health-check', 'runbook', 'clean-environment', 'performance', 'accessibility'],
};

// Evidence artifacts outside the readiness manifest, each decided by its own validator. The
// arguments are the kit's conventional paths — the same for every project.
const ARTIFACTS = [
  { id: 'requirement-coverage', dimension: 'functional', file: 'docs/evidence/requirement-coverage.json', script: 'requirement-coverage.js', args: [] },
  { id: 'security-baseline', dimension: 'engineering', file: 'docs/evidence/security-baseline.json', script: 'security-baseline.js', args: ['--control-sets', path.join(KIT_ROOT, 'standards', 'control-sets')] },
  { id: 'supply-chain', dimension: 'engineering', file: 'docs/evidence/supply-chain.json', script: 'supply-chain.js', args: [] },
  { id: 'operational-readiness', dimension: 'operations', file: 'docs/evidence/operational-readiness.json', script: 'operational-readiness.js', args: [] },
  { id: 'budgets', dimension: 'operations', file: 'docs/evidence/budgets.json', script: 'budgets.js', args: ['--profiles', path.join(KIT_ROOT, 'claude-setup', 'tests', 'fixtures', 'profiles')] },
];

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function scoreControl(id, manifest, verification, probe) {
  const declared = manifest?.controls?.[id];
  const verdict = verification?.verdicts?.find((v) => v.control === id);
  const probed = probe.results[id];

  if (declared?.status === 'not-applicable' && CONDITIONAL.has(id) && typeof declared.rationale === 'string' && declared.rationale.trim().length >= 20) {
    return { id, score: null, basis: 'not-applicable', reason: 'declared not-applicable with a rationale; excluded from the denominator' };
  }
  if (declared?.status === 'pass') {
    const evidence = verdict?.evidence || [];
    const types = (declared.evidence || []).map((e) => e?.type);
    if (verdict?.verdict === 'refuted' || evidence.some((e) => e.verdict === 'refuted')) {
      return { id, score: 0, basis: 'refuted', reason: `claimed pass, refuted: ${(evidence.find((e) => e.verdict === 'refuted') || verdict).reason}` };
    }
    if (types.length && types.every((t) => t === 'manual')) {
      return { id, score: 0, basis: 'manual-only', reason: 'claimed pass on human attestation alone (a screenshot is not a qualifying score)' };
    }
    if (evidence.some((e) => e.verdict === 'confirmed')) {
      return { id, score: 1, basis: 'confirmed', reason: 'claimed pass and at least one evidence item was independently confirmed' };
    }
    if (probed?.status === 'pass') return { id, score: 1, basis: 'probe', reason: `claimed pass; ${probed.reason}` };
    return { id, score: 0.5, basis: 'declared', reason: 'claimed pass, but no evidence item can be confirmed from here (commands are not executed by the benchmark)' };
  }
  if (declared && declared.status !== undefined) {
    // An explicit fail or pending from the builder is believed: nobody overstates a gap.
    return { id, score: 0, basis: 'declared', reason: `declared ${declared.status}` };
  }
  const value = probed?.status === 'pass' ? 1 : probed?.status === 'pending' ? 0.5 : 0;
  return { id, score: value, basis: 'probe', reason: probed ? `no manifest claim; probe says ${probed.status}: ${probed.reason}` : 'no manifest claim and no probe' };
}

function runArtifact(root, spec) {
  if (!fs.existsSync(path.join(root, spec.file))) {
    return { id: spec.id, score: 0, basis: 'absent', reason: `${spec.file} does not exist` };
  }
  const result = spawnSync(process.execPath, [path.join(__dirname, spec.script), '--root', root, '--file', spec.file, ...spec.args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status === 0) return { id: spec.id, score: 1, basis: 'validated', reason: `${spec.script} passed` };
  const tail = String(result.stdout || result.stderr).split(/\r?\n/).filter((l) => /fail|FAIL|error/i.test(l)).slice(0, 1)[0]?.trim() || `exited ${result.status}`;
  return { id: spec.id, score: 0, basis: 'invalid', reason: `${spec.script} failed: ${tail.slice(0, 160)}` };
}

function scoreEvals(root) {
  const dir = path.join(root, 'docs', 'evals');
  const cases = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^EV-\d+\.json$/.test(f)) : [];
  if (!cases.length) return { id: 'agent-evals', score: 0, basis: 'absent', reason: 'no docs/evals/*.json — nothing measures whether agents follow this configuration' };
  // A case counts when a baseline run of its CURRENT revision grades clean and derives pass —
  // gradeRun re-derives the outcome, refuses self-grading and continued sessions, and marks a
  // run of an edited case stale. Retired cases are left out of the denominator.
  const live = cases.map((f) => readJson(path.join(dir, f))).filter((c) => c && validateCase(c).ok && !c.retired);
  const runsDir = path.join(dir, 'runs');
  const runs = fs.existsSync(runsDir) ? fs.readdirSync(runsDir).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(runsDir, f))).filter(Boolean) : [];
  const passing = live.filter((c) => runs.some((run) => run.caseId === c.id && run.variant === 'baseline' && validateRun(run, { root }).ok && (() => {
    const graded = gradeRun(c, run);
    return graded.ok && !graded.stale && graded.derived === 'pass';
  })()));
  if (!live.length) return { id: 'agent-evals', score: 0, basis: 'invalid', reason: 'docs/evals/*.json has no valid, unretired case' };
  return { id: 'agent-evals', score: passing.length / live.length, basis: 'eval-runs', reason: `${passing.length}/${live.length} cases have a clean, passing baseline run at their current revision` };
}

function benchmark(rootInput, options = {}) {
  const root = path.resolve(rootInput);
  const manifestFile = path.join(root, 'docs', 'evidence', 'readiness.json');
  const manifest = readJson(manifestFile);
  const probe = assess(root, { gitRunner: options.gitRunner });
  // Verify at the level the manifest claims: a control it never claimed is a gap (scored 0 by
  // scoreControl), not a refutation, and counting it as one would call an honest R2 a liar.
  const verification = manifest ? verifyManifest(manifest, { root }) : null;
  const refuted = verification ? verification.verdicts.filter((v) => v.claimed === 'pass' && v.verdict === 'refuted') : [];
  const targetsR3 = manifest && ['R3', 'R4'].includes(manifest.targetLevel);
  const r3 = targetsR3 ? validateManifest(manifest, { root, level: 'R3' }) : null;

  const dimensions = {};
  for (const [name, controls] of Object.entries(DIMENSIONS)) {
    const items = controls.map((id) => scoreControl(id, manifest, verification, probe));
    for (const spec of ARTIFACTS.filter((a) => a.dimension === name)) items.push(runArtifact(root, spec));
    if (name === 'engineering') items.push(scoreEvals(root));
    const counted = items.filter((i) => i.score !== null);
    const score = counted.length ? counted.reduce((sum, i) => sum + i.score, 0) / counted.length : 0;
    dimensions[name] = { score: Math.round(score * 1000) / 1000, items };
  }

  const reasons = [];
  if (!manifest) reasons.push('no readiness manifest (docs/evidence/readiness.json)');
  else if (manifest.targetLevel !== 'R3' && manifest.targetLevel !== 'R4') reasons.push(`manifest targets ${manifest.targetLevel}, not R3`);
  else if (r3 && !r3.ok) reasons.push(`readiness R3 fails: ${r3.errors.length} error(s), first: ${r3.errors[0]}`);
  if (refuted.length) reasons.push(`independent verifier refuted ${refuted.length} claim(s): ${refuted.map((v) => v.control).join(', ')}`);
  for (const [name, dim] of Object.entries(dimensions)) {
    if (dim.score < QUALIFY_FLOOR) reasons.push(`${name} ${dim.score.toFixed(2)} is below ${QUALIFY_FLOOR}`);
  }
  const overall = Math.round((Object.values(dimensions).reduce((s, d) => s + d.score, 0) / 3) * 1000) / 1000;

  return {
    project: manifest?.project || path.basename(root),
    root,
    commit: manifest?.commit || probe.commit || null,
    generatedAt: (options.now || new Date()).toISOString(),
    sources: { manifest: !!manifest, verifier: !!verification, probe: true },
    readiness: { assessed: { proven: probe.summary.proven, reachable: probe.summary.reachable }, declared: manifest ? { targetLevel: manifest.targetLevel, r3: r3?.outcome || null } : null },
    dimensions,
    overall,
    qualified: reasons.length === 0,
    reasons,
  };
}

function parseArgs(argv) {
  const options = { roots: [], json: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--root') options.roots.push(argv[++index]);
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (options.roots.some((r) => !r)) throw new Error('--root requires a path');
  if (!options.roots.length) options.roots.push(process.cwd());
  return options;
}

function render(results) {
  const lines = [];
  const pad = (s, n) => String(s).padEnd(n);
  lines.push(`${pad('project', 30)} ${pad('functional', 11)} ${pad('engineering', 12)} ${pad('operations', 11)} ${pad('overall', 8)} PQA`);
  for (const r of results) {
    lines.push(`${pad(r.project, 30)} ${pad(r.dimensions.functional.score.toFixed(2), 11)} ${pad(r.dimensions.engineering.score.toFixed(2), 12)} ${pad(r.dimensions.operations.score.toFixed(2), 11)} ${pad(r.overall.toFixed(2), 8)} ${r.qualified ? 'yes' : 'no'}`);
  }
  for (const r of results) {
    if (r.qualified) continue;
    lines.push('', `${r.project} — not production-qualified:`);
    for (const reason of r.reasons) lines.push(`  - ${reason}`);
  }
  return lines.join('\n');
}

function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(argv); } catch (error) {
    console.error(`benchmark: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node benchmark.js [--root path]... [--json]');
    return 0;
  }
  for (const root of options.roots) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      console.error(`benchmark: not a directory: ${root}`);
      return 2;
    }
  }
  const results = options.roots.map((root) => benchmark(root));
  if (options.json) console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  else console.log(render(results));
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { ARTIFACTS, DIMENSIONS, QUALIFY_FLOOR, benchmark, parseArgs, render, scoreControl };
