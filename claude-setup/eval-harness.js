#!/usr/bin/env node
/**
 * eval-harness — eval case และ run record ที่รันซ้ำได้ (EV-004)
 *
 *   node claude-setup/eval-harness.js --cases docs/evals
 *   node claude-setup/eval-harness.js --cases docs/evals --runs docs/evals/runs --root .
 *   node claude-setup/eval-harness.js --revision docs/evals/EV-001.json
 *   node claude-setup/eval-harness.js --render docs/evals/EV-001.json
 *
 * ปัญหาที่แก้: รูปแบบ eval เดิมของ kit เป็น Markdown ที่ลงท้ายด้วยตาราง "ผลการรันล่าสุด"
 * ซึ่งคนกรอกเอง ⇒ ไม่มีอะไรบอกได้ว่าแถวนั้นตัดสินเคส **เวอร์ชันไหน** พอแก้เคสให้ง่ายลง
 * แถวที่เขียนว่า "ผ่าน" ก็ยังอยู่ตรงนั้น และยังอ่านว่าผ่านอยู่ดี
 *
 * ไฟล์นี้จึงบังคับสามอย่างที่ Markdown ทำไม่ได้:
 *
 *   1. **run ตรึงเวอร์ชันของเคส** ผ่าน caseRevision — แก้ prompt หรือ criteria เมื่อไหร่
 *      run เก่ากลายเป็น stale ทันที ไม่ใช่กลายเป็นหลักฐานผ่านที่ตกค้าง
 *   2. **คะแนนถูก derive ใหม่ทุกครั้ง** จาก verdict รายข้อ — run ที่สรุป "pass"
 *      ขณะที่ verdict ของตัวเองบอกตรงข้าม ไม่ผ่าน
 *   3. **คนเขียนเคสไม่ใช่คนตรวจเคส** — gradedBy ต้องต่างจาก authoredBy
 *      (บทเรียนตรง ๆ จาก EV-009: eval 5 เคสถูกเตรียมให้โปรเจกต์จริงแล้วจงใจไม่รัน
 *      เพราะ session ที่เขียน config เป็น session เดียวกับที่จะตรวจ)
 *
 * และรายงานสองอย่างที่ต้องดูข้าม run ถึงจะเห็น:
 *   - **ablation** — รอบที่ปิด rule/skill ทิ้ง ถ้าผลเหมือนเดิม แปลว่าไฟล์นั้นไม่ได้ทำอะไร
 *   - **nondeterministic** — caseRevision + commit + model เดียวกัน แต่ผลไม่ตรงกัน
 *     ⇒ ข้อมูลเกี่ยวกับ "เคส" ไม่ใช่เกี่ยวกับโมเดล
 *
 * exit 0 = ผ่าน (อาจมี warning) | exit 1 = มีข้อผิดพลาด | exit 2 = input ผิด
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SCHEMA_VERSION = '1.0';
const CASE_ID = /^EV-\d{3,}$/;
const CRITERION_ID = /^C\d{1,2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COMMIT = /^[0-9a-f]{7,40}$/;
const REVISION = /^sha256:[0-9a-f]{64}$/;
const KINDS = new Set(['must-happen', 'must-not-happen']);
const VERDICTS = new Set(['pass', 'fail', 'unclear']);

// เฉพาะฟิลด์ที่ "เปลี่ยนแล้วคำตอบเปลี่ยน" เท่านั้นที่เข้า hash
//
// ตั้งใจไม่รวม: title, authoredBy, origin, observedIn, retired, $schema, _
// การแก้ชื่อเคสหรือการปลดเคสออกใช้งานไม่ได้เปลี่ยนสิ่งที่เคสถาม ⇒ ไม่ควรทำให้ run
// ที่ตัดสินไปแล้วกลายเป็นโมฆะ ส่วน prompt/criteria/passWhen/tests/setup/ablation/retain
// เปลี่ยนเมื่อไหร่ คำตอบเดิมตอบคนละคำถาม
const REVISION_FIELDS = Object.freeze([
  'schemaVersion', 'id', 'tests', 'setup', 'prompt', 'followUpPrompt', 'criteria', 'ablation', 'retain', 'passWhen',
]);

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value, min = 1) => typeof value === 'string' && value.trim().length >= min;

// stable stringify — key เรียงลำดับ เพื่อให้ hash ไม่ขึ้นกับลำดับที่คนพิมพ์
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function caseRevision(evalCase) {
  const subset = {};
  for (const field of REVISION_FIELDS) {
    if (evalCase[field] !== undefined) subset[field] = evalCase[field];
  }
  return `sha256:${crypto.createHash('sha256').update(stable(subset)).digest('hex')}`;
}

function validateCase(evalCase, options = {}) {
  const errors = [];
  if (!isPlainObject(evalCase)) return { ok: false, errors: ['eval case must be a JSON object'] };

  if (evalCase.schemaVersion !== SCHEMA_VERSION) errors.push(`unsupported schemaVersion "${evalCase.schemaVersion}"`);
  if (!CASE_ID.test(evalCase.id || '')) errors.push('id must look like EV-001');
  if (options.expectedId && evalCase.id !== options.expectedId) {
    errors.push(`id "${evalCase.id}" does not match filename "${options.expectedId}.json"`);
  }
  if (!isNonEmptyString(evalCase.title, 10)) errors.push('title must be at least 10 characters');
  if (!isNonEmptyString(evalCase.authoredBy, 3)) errors.push('authoredBy is required — a case whose author is unknown cannot be checked against its grader');
  if (!['observed-failure', 'designed'].includes(evalCase.origin)) {
    errors.push('origin must be "observed-failure" or "designed"');
  }
  if (evalCase.origin === 'observed-failure' && !isNonEmptyString(evalCase.observedIn)) {
    errors.push('origin "observed-failure" requires observedIn to name where the real mistake is recorded');
  }
  if (evalCase.origin === 'designed' && evalCase.observedIn !== undefined) {
    errors.push('observedIn belongs to an observed-failure case; a designed case claiming one is misreporting where it came from');
  }
  if (!isNonEmptyString(evalCase.prompt, 10)) errors.push('prompt must be at least 10 characters');
  if (evalCase.followUpPrompt !== undefined && !isNonEmptyString(evalCase.followUpPrompt)) {
    errors.push('followUpPrompt must be a non-empty string when present');
  }

  const tests = evalCase.tests;
  if (!Array.isArray(tests) || tests.length === 0) {
    errors.push('tests must name at least one configuration file this case exercises');
  } else {
    if (new Set(tests).size !== tests.length) errors.push('tests contains a duplicate path');
    for (const target of tests) {
      if (!isNonEmptyString(target)) { errors.push('tests entries must be non-empty paths'); continue; }
      // เคสที่ชี้ไปยังไฟล์ที่ไม่มีแล้ว คือเคสที่อยู่ต่อจาก rule ที่ถูกลบไปแล้ว
      if (options.root && !fs.existsSync(path.resolve(options.root, target))) {
        errors.push(`tests names a file that does not exist: ${target}`);
      }
    }
  }

  const criteria = evalCase.criteria;
  const ids = new Set();
  if (!Array.isArray(criteria) || criteria.length < 2) {
    errors.push('criteria must contain at least 2 entries');
  } else {
    let mustHappen = 0;
    let mustNot = 0;
    for (const [index, criterion] of criteria.entries()) {
      const label = criterion?.id || `criteria[${index}]`;
      if (!isPlainObject(criterion)) { errors.push(`${label}: criterion must be an object`); continue; }
      if (!CRITERION_ID.test(criterion.id || '')) errors.push(`${label}: id must look like C1`);
      else if (ids.has(criterion.id)) errors.push(`${label}: duplicate criterion id`);
      else ids.add(criterion.id);
      if (!KINDS.has(criterion.kind)) errors.push(`${label}: kind must be must-happen or must-not-happen`);
      if (criterion.kind === 'must-happen') mustHappen++;
      if (criterion.kind === 'must-not-happen') mustNot++;
      if (!isNonEmptyString(criterion.statement, 10)) errors.push(`${label}: statement must be at least 10 characters`);
      if (criterion.weight !== undefined && (typeof criterion.weight !== 'number' || !(criterion.weight > 0))) {
        errors.push(`${label}: weight must be a number greater than 0`);
      }
    }
    // เคสที่มีแต่ "ต้องเกิด" จับได้แค่การทำไม่ครบ ไม่เคยจับการทำเกิน ซึ่งเป็นความผิดพลาด
    // ที่พบบ่อยกว่าในงาน AI — ทั้งสี่เคสที่ kit แจกมามีทั้งสองฝั่งอยู่แล้ว
    if (mustHappen < 1) errors.push('criteria must contain at least one must-happen entry');
    if (mustNot < 1) errors.push('criteria must contain at least one must-not-happen entry');
  }

  if (evalCase.setup !== undefined) {
    if (!Array.isArray(evalCase.setup)) errors.push('setup must be an array when present');
    else for (const step of evalCase.setup) if (!isNonEmptyString(step)) errors.push('setup entries must be non-empty strings');
  }

  if (evalCase.ablation !== undefined) {
    const ablation = evalCase.ablation;
    if (!isPlainObject(ablation)) errors.push('ablation must be an object when present');
    else {
      if (!Array.isArray(ablation.disable) || ablation.disable.length === 0) {
        errors.push('ablation.disable must name at least one path to switch off');
      } else {
        for (const target of ablation.disable) {
          // ปิดของที่เคสไม่ได้เทสอยู่แล้ว ไม่ได้บอกอะไรเกี่ยวกับเคสนี้
          if (Array.isArray(tests) && !tests.includes(target)) {
            errors.push(`ablation.disable "${target}" is not one of this case's tests paths`);
          }
        }
      }
      if (!isNonEmptyString(ablation.note, 10)) errors.push('ablation.note must say what a matching result would mean');
    }
  }

  if (evalCase.retain !== undefined) {
    if (!Array.isArray(evalCase.retain)) errors.push('retain must be an array when present');
    else for (const name of evalCase.retain) if (!isNonEmptyString(name)) errors.push('retain entries must be non-empty strings');
  }

  const passWhen = evalCase.passWhen;
  if (!isPlainObject(passWhen)) {
    errors.push('passWhen is required');
  } else {
    if (typeof passWhen.minScore !== 'number' || passWhen.minScore < 0 || passWhen.minScore > 1) {
      errors.push('passWhen.minScore must be a number between 0 and 1');
    }
    if (passWhen.allMustNotHappen !== undefined && typeof passWhen.allMustNotHappen !== 'boolean') {
      errors.push('passWhen.allMustNotHappen must be a boolean when present');
    }
  }

  if (evalCase.retired !== undefined) {
    if (!isPlainObject(evalCase.retired)) errors.push('retired must be an object when present');
    else {
      if (!DATE.test(evalCase.retired.on || '')) errors.push('retired.on must be YYYY-MM-DD');
      if (!isNonEmptyString(evalCase.retired.reason, 10)) errors.push('retired.reason must be at least 10 characters');
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateRun(run, options = {}) {
  const errors = [];
  if (!isPlainObject(run)) return { ok: false, errors: ['eval run must be a JSON object'] };

  if (run.schemaVersion !== SCHEMA_VERSION) errors.push(`unsupported schemaVersion "${run.schemaVersion}"`);
  if (!CASE_ID.test(run.caseId || '')) errors.push('caseId must look like EV-001');
  if (!REVISION.test(run.caseRevision || '')) errors.push('caseRevision must look like sha256:<64 hex> (print it with --revision)');
  if (!DATE.test(run.runAt || '')) errors.push('runAt must be YYYY-MM-DD');
  if (!isNonEmptyString(run.model, 3)) errors.push('model is required');
  if (!COMMIT.test(run.commit || '')) errors.push('commit must be a git revision (7-40 hex characters)');
  if (!['clean', 'continued'].includes(run.session)) errors.push('session must be "clean" or "continued"');
  if (!isNonEmptyString(run.gradedBy, 3)) errors.push('gradedBy is required');
  if (!['baseline', 'ablation'].includes(run.variant)) errors.push('variant must be "baseline" or "ablation"');
  if (!['pass', 'fail'].includes(run.outcome)) errors.push('outcome must be "pass" or "fail"');

  if (!Array.isArray(run.results) || run.results.length === 0) {
    errors.push('results must contain a verdict for every criterion');
  } else {
    const seen = new Set();
    for (const [index, result] of run.results.entries()) {
      const label = result?.criterionId || `results[${index}]`;
      if (!isPlainObject(result)) { errors.push(`${label}: result must be an object`); continue; }
      if (!CRITERION_ID.test(result.criterionId || '')) errors.push(`${label}: criterionId must look like C1`);
      else if (seen.has(result.criterionId)) errors.push(`${label}: duplicate verdict for the same criterion`);
      else seen.add(result.criterionId);
      if (!VERDICTS.has(result.verdict)) errors.push(`${label}: verdict must be pass, fail or unclear`);
      if (result.note !== undefined && !isNonEmptyString(result.note)) errors.push(`${label}: note must be a non-empty string when present`);
    }
  }

  if (run.artifacts !== undefined) {
    if (!Array.isArray(run.artifacts)) errors.push('artifacts must be an array when present');
    else for (const [index, artifact] of run.artifacts.entries()) {
      const label = artifact?.name || `artifacts[${index}]`;
      if (!isPlainObject(artifact)) { errors.push(`${label}: artifact must be an object`); continue; }
      if (!isNonEmptyString(artifact.name)) errors.push(`${label}: name is required`);
      if (!isNonEmptyString(artifact.path)) { errors.push(`${label}: path is required`); continue; }
      if (options.root && !fs.existsSync(path.resolve(options.root, artifact.path))) {
        errors.push(`${label}: retained artifact does not exist: ${artifact.path}`);
      }
    }
  }

  if (run.notes !== undefined && !isNonEmptyString(run.notes)) errors.push('notes must be a non-empty string when present');

  return { ok: errors.length === 0, errors };
}

/**
 * ตัดสิน run หนึ่งใบกับเคสของมัน — ทุกอย่างในนี้ derive ใหม่ ไม่เชื่อค่าที่ run ประกาศ
 */
function gradeRun(evalCase, run) {
  const errors = [];
  const criteria = Array.isArray(evalCase.criteria) ? evalCase.criteria : [];
  const byId = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const results = Array.isArray(run.results) ? run.results : [];

  const expected = caseRevision(evalCase);
  const stale = run.caseRevision !== expected;
  if (stale) {
    errors.push(
      `caseRevision does not match ${evalCase.id} as it stands now — this run judged a different revision of the case, ` +
      `so it no longer says anything about the current one (expected ${expected})`
    );
  }

  // session ที่ต่อจากบทสนทนาเดิมผ่านเพราะ context ที่ค้าง ไม่ใช่เพราะ config
  if (run.session === 'continued') {
    errors.push('session "continued" cannot pass: a case that runs on top of an earlier conversation tests the conversation, not the configuration');
  }
  // คนออกข้อสอบมาตรวจข้อสอบตัวเอง — บทเรียนจาก EV-009
  if (isNonEmptyString(run.gradedBy) && isNonEmptyString(evalCase.authoredBy) && run.gradedBy.trim() === evalCase.authoredBy.trim()) {
    errors.push(`gradedBy "${run.gradedBy}" is the case's own author; a case cannot be graded by whoever wrote it`);
  }

  const missing = criteria.filter((criterion) => !results.some((result) => result.criterionId === criterion.id));
  const extra = results.filter((result) => !byId.has(result.criterionId));
  for (const criterion of missing) errors.push(`no verdict for criterion ${criterion.id}`);
  for (const result of extra) errors.push(`verdict for unknown criterion ${result.criterionId}`);

  let totalWeight = 0;
  let earnedWeight = 0;
  let unclear = 0;
  let mustNotViolated = 0;
  for (const criterion of criteria) {
    const weight = criterion.weight === undefined ? 1 : criterion.weight;
    totalWeight += weight;
    const result = results.find((entry) => entry.criterionId === criterion.id);
    if (!result) continue;
    if (result.verdict === 'pass') earnedWeight += weight;
    if (result.verdict === 'unclear') unclear++;
    if (criterion.kind === 'must-not-happen' && result.verdict !== 'pass') mustNotViolated++;
  }

  const score = totalWeight > 0 ? earnedWeight / totalWeight : 0;
  const minScore = evalCase.passWhen?.minScore ?? 1;
  const allMustNotHappen = evalCase.passWhen?.allMustNotHappen !== false;
  const scoreMet = score + 1e-9 >= minScore;
  const derived = !missing.length && scoreMet && !(allMustNotHappen && mustNotViolated) ? 'pass' : 'fail';

  if (run.outcome !== derived) {
    errors.push(
      `outcome "${run.outcome}" disagrees with this run's own verdicts, which derive "${derived}" ` +
      `(score ${score.toFixed(2)}, threshold ${minScore}${mustNotViolated ? `, ${mustNotViolated} must-not-happen criterion/criteria violated` : ''})`
    );
  }

  // retain คือสัญญาว่า run จะเก็บอะไรไว้ให้ตรวจย้อนได้ — run ที่ไม่เก็บ พิสูจน์ตัวเองไม่ได้
  const kept = new Set((run.artifacts || []).map((artifact) => artifact.name));
  for (const name of evalCase.retain || []) {
    if (!kept.has(name)) errors.push(`${evalCase.id} requires the run to retain "${name}", and this run cites no such artifact`);
  }

  return { ok: errors.length === 0, errors, stale, score, derived, unclear, mustNotViolated, totalWeight, earnedWeight };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listJson(dir) {
  return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort().map((name) => path.join(dir, name));
}

/**
 * รายงานที่ต้องดูข้าม run ถึงจะเห็น: ablation และความไม่คงที่ของเคส
 */
function analyse(cases, runsByCase) {
  const warnings = [];
  for (const entry of cases) {
    const { value: evalCase, revision } = entry;
    const runs = (runsByCase.get(evalCase.id) || []).filter((run) => run.caseRevision === revision);
    if (evalCase.retired) continue;

    if (!runs.length) {
      warnings.push({ code: 'unrun', where: evalCase.id, message: 'no run records this revision of the case — an eval nobody runs is dead documentation' });
      continue;
    }

    if (evalCase.ablation) {
      const baseline = runs.filter((run) => run.variant === 'baseline');
      const ablation = runs.filter((run) => run.variant === 'ablation');
      if (!ablation.length) {
        warnings.push({ code: 'ablation-unrun', where: evalCase.id, message: `ablation round never run — nothing shows whether ${evalCase.ablation.disable.join(', ')} changes the outcome at all` });
      } else if (baseline.length) {
        const baselineOutcomes = new Set(baseline.map((run) => run.outcome));
        const ablationOutcomes = new Set(ablation.map((run) => run.outcome));
        const identical = baselineOutcomes.size === 1 && ablationOutcomes.size === 1 && [...baselineOutcomes][0] === [...ablationOutcomes][0];
        if (identical) {
          warnings.push({
            code: 'ablation-inconclusive',
            where: evalCase.id,
            message: `switching off ${evalCase.ablation.disable.join(', ')} did not change the outcome — on this evidence that file is not what produces the behaviour`,
          });
        }
      }
    }

    // caseRevision + commit + model + variant เดียวกัน แต่ผลต่าง ⇒ เคสไม่คงที่
    const groups = new Map();
    for (const run of runs) {
      const key = `${run.commit}|${run.model}|${run.variant}`;
      if (!groups.has(key)) groups.set(key, new Set());
      groups.get(key).add(run.outcome);
    }
    for (const [key, outcomes] of groups) {
      if (outcomes.size > 1) {
        warnings.push({ code: 'nondeterministic', where: evalCase.id, message: `same case revision, commit, model and variant (${key}) produced both pass and fail — this is information about the case's wording, not about the model` });
      }
    }

    const unclear = runs.reduce((sum, run) => sum + (run.results || []).filter((result) => result.verdict === 'unclear').length, 0);
    if (unclear) {
      warnings.push({ code: 'unclear-criteria', where: evalCase.id, message: `${unclear} verdict(s) recorded as unclear — a criterion a grader cannot decide is a criterion that needs rewriting` });
    }
  }
  return warnings;
}

/**
 * มุมมอง Markdown ของเคส — ตรวจตัวเองว่าทุกค่าที่ derive ได้ปรากฏจริงในผลลัพธ์
 * (แบบเดียวกับ claude-setup/product-graph.js) เพื่อให้ฝั่งที่คนอ่านตกอะไรไม่ได้เงียบ ๆ
 */
function renderCase(evalCase) {
  const lines = [];
  lines.push(`# ${evalCase.id}: ${evalCase.title}`, '');
  lines.push(`> revision \`${caseRevision(evalCase)}\` · เขียนโดย ${evalCase.authoredBy} · origin: ${evalCase.origin}`, '');
  if (evalCase.observedIn) lines.push(`**ที่มาของจริง:** ${evalCase.observedIn}`, '');
  if (evalCase.retired) lines.push(`> ⛔ **ปลดออกแล้วเมื่อ ${evalCase.retired.on}** — ${evalCase.retired.reason}`, '');
  lines.push('## เทสอะไร', '');
  for (const target of evalCase.tests) lines.push(`- \`${target}\``);
  lines.push('');
  if (evalCase.setup?.length) {
    lines.push('## เตรียมก่อน', '');
    for (const step of evalCase.setup) lines.push(`- ${step}`);
    lines.push('');
  }
  lines.push('## Prompt', '', '```', evalCase.prompt, '```', '');
  if (evalCase.followUpPrompt) lines.push('แล้วกดดันต่อ:', '', '```', evalCase.followUpPrompt, '```', '');
  lines.push('## ต้องเกิด', '');
  for (const criterion of evalCase.criteria.filter((entry) => entry.kind === 'must-happen')) {
    lines.push(`- [ ] **${criterion.id}** ${criterion.statement}`);
  }
  lines.push('', '## ต้องไม่เกิด', '');
  for (const criterion of evalCase.criteria.filter((entry) => entry.kind === 'must-not-happen')) {
    lines.push(`- [ ] **${criterion.id}** ${criterion.statement}`);
  }
  lines.push('');
  const allMustNot = evalCase.passWhen.allMustNotHappen !== false;
  lines.push('## ผ่านเมื่อ', '');
  lines.push(`- คะแนนอย่างน้อย **${evalCase.passWhen.minScore}**`);
  lines.push(`- ข้อ "ต้องไม่เกิด" ${allMustNot ? '**ต้องผ่านทุกข้อ** ไม่ว่าคะแนนจะเท่าไหร่' : 'ไม่ได้บังคับทุกข้อ (เคสนี้ประกาศยอมไว้)'}`);
  lines.push('');
  if (evalCase.ablation) {
    lines.push('## รอบเปรียบเทียบ (ablation)', '');
    lines.push(`ปิด ${evalCase.ablation.disable.map((target) => `\`${target}\``).join(', ')} แล้วรันซ้ำ`, '');
    lines.push(`> ${evalCase.ablation.note}`, '');
  }
  if (evalCase.retain?.length) {
    lines.push('## ทุก run ต้องเก็บ', '');
    for (const name of evalCase.retain) lines.push(`- \`${name}\``);
    lines.push('');
  }
  lines.push('---', '', 'บันทึกผลเป็น eval run record — ห้ามแก้ไฟล์นี้เพื่อให้ผลเก่าผ่าน', '',
    `    node claude-setup/eval-harness.js --revision <ไฟล์เคส>`, '');

  const rendered = lines.join('\n');
  // self-check: ค่าที่เป็นสาระของเคสต้องอยู่ในผลลัพธ์ครบ
  const mustAppear = [evalCase.id, evalCase.title, evalCase.prompt, ...evalCase.tests, ...evalCase.criteria.map((c) => c.statement)];
  if (evalCase.followUpPrompt) mustAppear.push(evalCase.followUpPrompt);
  const dropped = mustAppear.filter((value) => !rendered.includes(value));
  if (dropped.length) throw new Error(`render dropped ${dropped.length} value(s) from the case: ${dropped[0]}`);
  return rendered;
}

function parseArgs(argv) {
  const options = { cases: null, runs: null, root: null, revision: null, render: null, json: false, help: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--cases') options.cases = argv[++index];
    else if (arg === '--runs') options.runs = argv[++index];
    else if (arg === '--root') options.root = argv[++index];
    else if (arg === '--revision') options.revision = argv[++index];
    else if (arg === '--render') options.render = argv[++index];
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (options.help) return options;
  // ตรวจข้อนี้ก่อน เพราะ --runs ลอย ๆ มีคำตอบที่ช่วยได้มากกว่า "ต้องใส่ --cases สักอย่าง"
  if (options.runs && !options.cases) throw new Error('--runs requires --cases');
  const modes = [options.cases, options.revision, options.render].filter(Boolean).length;
  if (modes === 0) throw new Error('--cases, --revision or --render is required');
  if (modes > 1) throw new Error('--cases, --revision and --render cannot be combined');
  return options;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`eval-harness: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log([
      'Usage:',
      '  node claude-setup/eval-harness.js --cases <dir> [--runs <dir>] [--root <dir>] [--json]',
      '  node claude-setup/eval-harness.js --revision <case file>',
      '  node claude-setup/eval-harness.js --render <case file>',
    ].join('\n'));
    return 0;
  }

  if (options.revision || options.render) {
    const file = path.resolve(process.cwd(), options.revision || options.render);
    let value;
    try {
      value = readJson(file);
    } catch (error) {
      console.error(`eval-harness: cannot read ${options.revision || options.render}: ${error.message}`);
      return 2;
    }
    const result = validateCase(value, { expectedId: path.basename(file, '.json') });
    if (!result.ok) {
      console.error(`eval-harness: ${path.basename(file)} is not a valid eval case`);
      for (const error of result.errors) console.error(`  - ${error}`);
      return 1;
    }
    if (options.revision) console.log(caseRevision(value));
    else console.log(renderCase(value));
    return 0;
  }

  const root = path.resolve(process.cwd(), options.root || '.');
  const casesDir = path.resolve(process.cwd(), options.cases);
  if (!fs.existsSync(casesDir)) {
    console.error(`eval-harness: no such directory: ${options.cases}`);
    return 2;
  }
  const caseFiles = listJson(casesDir);
  if (!caseFiles.length) {
    console.error(`eval-harness: no eval cases found in ${options.cases}`);
    return 2;
  }

  const errors = [];
  const cases = [];
  const byId = new Map();
  for (const file of caseFiles) {
    const expectedId = path.basename(file, '.json');
    let value;
    try {
      value = readJson(file);
    } catch (error) {
      errors.push({ where: path.relative(root, file), message: `cannot read/parse: ${error.message}` });
      continue;
    }
    const result = validateCase(value, { expectedId, root });
    if (!result.ok) {
      for (const message of result.errors) errors.push({ where: path.relative(root, file), message });
      continue;
    }
    if (byId.has(value.id)) {
      errors.push({ where: path.relative(root, file), message: `duplicate case id ${value.id}` });
      continue;
    }
    const entry = { file, value, revision: caseRevision(value) };
    byId.set(value.id, entry);
    cases.push(entry);
  }

  const runsByCase = new Map();
  let runCount = 0;
  if (options.runs) {
    const runsDir = path.resolve(process.cwd(), options.runs);
    if (!fs.existsSync(runsDir)) {
      console.error(`eval-harness: no such directory: ${options.runs}`);
      return 2;
    }
    for (const file of listJson(runsDir)) {
      const where = path.relative(root, file);
      let run;
      try {
        run = readJson(file);
      } catch (error) {
        errors.push({ where, message: `cannot read/parse: ${error.message}` });
        continue;
      }
      const shape = validateRun(run, { root });
      if (!shape.ok) {
        for (const message of shape.errors) errors.push({ where, message });
        continue;
      }
      runCount++;
      const entry = byId.get(run.caseId);
      if (!entry) {
        errors.push({ where, message: `run names case ${run.caseId}, which is not in ${options.cases}` });
        continue;
      }
      const graded = gradeRun(entry.value, run);
      for (const message of graded.errors) errors.push({ where, message });
      if (!runsByCase.has(run.caseId)) runsByCase.set(run.caseId, []);
      runsByCase.get(run.caseId).push(run);
    }
  }

  const warnings = options.runs ? analyse(cases, runsByCase) : [];
  const ok = errors.length === 0;

  if (options.json) {
    console.log(JSON.stringify({
      ok,
      cases: cases.map((entry) => ({ id: entry.value.id, revision: entry.revision, retired: !!entry.value.retired, runs: (runsByCase.get(entry.value.id) || []).length })),
      runs: runCount,
      errors,
      warnings,
    }, null, 2));
  } else {
    for (const entry of cases) {
      const runs = runsByCase.get(entry.value.id) || [];
      const current = runs.filter((run) => run.caseRevision === entry.revision);
      const suffix = entry.value.retired ? ' (retired)' : '';
      console.log(`${entry.value.id}  ${entry.revision.slice(0, 19)}…  runs: ${current.length}/${runs.length} at this revision${suffix}`);
    }
    console.log('');
    for (const error of errors) console.log(`✗ ${error.where}: ${error.message}`);
    for (const warning of warnings) console.log(`! ${warning.where} [${warning.code}]: ${warning.message}`);
    if (errors.length || warnings.length) console.log('');
    console.log(ok
      ? `✓ eval-harness: ${cases.length} case(s), ${runCount} run(s) valid${warnings.length ? `, ${warnings.length} warning(s)` : ''}`
      : `✗ eval-harness: ${errors.length} error(s) across ${cases.length} case(s) and ${runCount} run(s)`);
  }

  return ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { REVISION_FIELDS, caseRevision, validateCase, validateRun, gradeRun, analyse, renderCase, parseArgs, main };
