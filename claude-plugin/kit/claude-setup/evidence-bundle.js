#!/usr/bin/env node
/**
 * evidence-bundle — wraps a readiness manifest into a single Evidence Bundle (EP-001)
 *
 *   node claude-setup/evidence-bundle.js --root <path> --check
 *   node claude-setup/evidence-bundle.js --root <path> --write
 *   node claude-setup/evidence-bundle.js --root <path>              (preview Markdown to stdout)
 *
 * ทำไมต้องมี: readiness.json บอกว่า control ไหนผ่าน/ไม่ผ่าน แต่ไม่มี format เดียวที่ห่อรวม
 * (1) ตัว readiness manifest, (2) รายงานที่คนอ่านได้ และ (3) immutable run metadata (commit,
 * เวลาที่ generate, เวอร์ชันเครื่องมือที่ generate) เข้าด้วยกัน — ไฟล์นี้ทำหน้าที่นั้นแบบ
 * stack-agnostic: อ่านแค่ docs/evidence/readiness.json ตาม readiness-manifest contract ที่มีอยู่แล้ว
 * ไม่รู้จัก stack pack ใดเป็นพิเศษ จึงใช้กับ PP-003 (nextjs-postgres-crud) และ PP-004
 * (react-fastapi-postgres-crud) ได้โดยไม่ต้อง special-case
 *
 * รายงาน Markdown ตรวจตัวเองว่าไม่มี control id, status, evidence หรือ rationale ตัวไหนจาก
 * readiness manifest หายไปจากเอกสาร ก่อนเขียนออก — หลักการเดียวกับ claude-setup/product-graph.js
 *
 * exit 0 = ผ่าน | exit 1 = ใช้งานผิด (ไม่ควรเกิดถ้า build สำเร็จ) | exit 2 = อ่าน/สร้างไม่ได้
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateManifest } = require('./readiness.js');

const COMMIT_PATTERN = /^[0-9a-fA-F]{7,64}$/;
const LEVELS = new Set(['R0', 'R1', 'R2', 'R3', 'R4']);

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toPosix(value) {
  return String(value).split(path.sep).join('/');
}

function insideRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function cell(value) {
  if (value === undefined || value === null || value === '') return '—';
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderReportIndex(bundle, manifest) {
  const lines = [
    `# Evidence bundle — ${bundle.project}`,
    '',
    `commit: \`${bundle.commit}\` · generated: ${bundle.generatedAt} · level: ${bundle.summary.level} · ${bundle.summary.ok ? 'PASS' : 'FAIL'} (${bundle.summary.passed}/${bundle.summary.required})`,
    '',
    `tool versions: node ${bundle.toolVersions.node}, ${bundle.toolVersions.platform}/${bundle.toolVersions.arch}`,
    '',
    `Readiness manifest: \`${bundle.readinessManifestPath}\` (profile: ${cell(manifest.profile)}, target: ${cell(manifest.targetLevel)})`,
    '',
    '## Controls',
    '',
    '| control | status | evidence |',
    '| --- | --- | --- |',
  ];
  for (const [controlId, control] of Object.entries(manifest.controls || {})) {
    const parts = [];
    for (const item of Array.isArray(control.evidence) ? control.evidence : []) {
      parts.push(`${cell(item.type)}: ${cell(item.value)}`);
    }
    if (control.rationale) parts.push(cell(control.rationale));
    lines.push(`| ${controlId} | ${cell(control.status)} | ${parts.length ? parts.join('<br>') : '—'} |`);
  }
  return `${lines.join('\n')}\n`;
}

function collectControlLeaves(controls) {
  const leaves = [];
  for (const [controlId, control] of Object.entries(controls || {})) {
    leaves.push(controlId, String(control.status));
    if (control.rationale) leaves.push(control.rationale);
    for (const item of Array.isArray(control.evidence) ? control.evidence : []) {
      leaves.push(item.type, item.value);
    }
  }
  return leaves;
}

function validateBundle(bundle) {
  const errors = [];
  if (!isPlainObject(bundle)) return { ok: false, errors: ['evidence bundle must be a JSON object'] };
  if (bundle.schemaVersion !== '1.0') errors.push(`unsupported schemaVersion "${bundle.schemaVersion}"`);
  if (typeof bundle.project !== 'string' || !bundle.project.trim()) errors.push('project must be a non-empty string');
  if (!COMMIT_PATTERN.test(bundle.commit || '')) errors.push('commit must be a 7-64 character hexadecimal revision');
  if (Number.isNaN(Date.parse(bundle.generatedAt))) errors.push('generatedAt must be an ISO-8601 timestamp');
  if (typeof bundle.readinessManifestPath !== 'string' || !bundle.readinessManifestPath.trim()) {
    errors.push('readinessManifestPath must be a non-empty string');
  }
  if (typeof bundle.reportIndexPath !== 'string' || !bundle.reportIndexPath.trim()) {
    errors.push('reportIndexPath must be a non-empty string');
  }

  if (!isPlainObject(bundle.toolVersions)) {
    errors.push('toolVersions must be an object');
  } else {
    for (const key of ['node', 'platform', 'arch']) {
      if (typeof bundle.toolVersions[key] !== 'string' || !bundle.toolVersions[key].trim()) {
        errors.push(`toolVersions.${key} must be a non-empty string`);
      }
    }
  }

  if (!isPlainObject(bundle.summary)) {
    errors.push('summary must be an object');
  } else {
    if (!LEVELS.has(bundle.summary.level)) errors.push('summary.level must be one of R0-R4');
    if (typeof bundle.summary.ok !== 'boolean') errors.push('summary.ok must be a boolean');
    if (!Number.isInteger(bundle.summary.passed) || bundle.summary.passed < 0) {
      errors.push('summary.passed must be a non-negative integer');
    }
    if (!Number.isInteger(bundle.summary.required) || bundle.summary.required < 0) {
      errors.push('summary.required must be a non-negative integer');
    }
  }

  return { ok: errors.length === 0, errors };
}

// Builds a bundle + its report index from an existing readiness manifest. Throws on anything
// that would make the bundle meaningless to produce (missing file, unparseable JSON, missing
// the identity fields a bundle must carry) — it does not require the manifest to actually PASS,
// since a bundle can legitimately wrap and report a failing readiness evaluation too.
function buildBundle({ root, manifestPath, reportIndexPath, now }) {
  const manifestFile = path.resolve(root, manifestPath);
  if (!insideRoot(root, manifestFile)) {
    throw new Error('readiness manifest path must stay inside the project root');
  }
  if (!fs.existsSync(manifestFile)) {
    throw new Error(`readiness manifest not found: ${manifestPath}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  } catch (error) {
    throw new Error(`cannot parse ${manifestPath}: ${error.message}`, { cause: error });
  }
  if (typeof manifest.project !== 'string' || !manifest.project.trim()) {
    throw new Error(`${manifestPath}: manifest.project must be a non-empty string`);
  }
  if (!COMMIT_PATTERN.test(manifest.commit || '')) {
    throw new Error(`${manifestPath}: manifest.commit must be a 7-64 character hexadecimal revision`);
  }
  if (!LEVELS.has(manifest.targetLevel)) {
    throw new Error(`${manifestPath}: manifest.targetLevel must be one of R0-R4`);
  }

  const evaluation = validateManifest(manifest, { root, level: manifest.targetLevel });

  const bundle = {
    $schema: '../../buaflow/schemas/evidence-bundle.schema.json',
    schemaVersion: '1.0',
    project: manifest.project,
    commit: manifest.commit,
    generatedAt: now || new Date().toISOString(),
    readinessManifestPath: toPosix(path.relative(root, manifestFile)),
    reportIndexPath: toPosix(reportIndexPath),
    toolVersions: { node: process.version, platform: process.platform, arch: process.arch },
    summary: {
      level: evaluation.level,
      ok: evaluation.ok,
      passed: evaluation.passed,
      required: evaluation.required,
    },
  };

  const markdown = renderReportIndex(bundle, manifest);
  const leaves = collectControlLeaves(manifest.controls);
  const missing = leaves.filter((leaf) => !markdown.includes(String(leaf)));
  if (missing.length) {
    throw new Error(`generated report index dropped ${missing.length} value(s) from the readiness manifest, e.g. "${missing[0]}"`);
  }

  return { bundle, manifest, markdown };
}

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    file: 'docs/evidence/readiness.json',
    out: 'docs/evidence/bundle.json',
    reportOut: 'docs/evidence/bundle-index.md',
    write: false,
    check: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--root') options.root = argv[++index];
    else if (arg === '--file') options.file = argv[++index];
    else if (arg === '--out') options.out = argv[++index];
    else if (arg === '--report-out') options.reportOut = argv[++index];
    else if (arg === '--write') options.write = true;
    else if (arg === '--check') options.check = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (options.write && options.check) throw new Error('--write and --check cannot be used together');
  return options;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`evidence-bundle: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log(
      'Usage: node claude-setup/evidence-bundle.js --root <path> [--file readiness.json] '
      + '[--out bundle.json] [--report-out bundle-index.md] [--check | --write] [--json]'
    );
    return 0;
  }

  const root = path.resolve(options.root);
  let built;
  try {
    built = buildBundle({ root, manifestPath: options.file, reportIndexPath: options.reportOut });
  } catch (error) {
    console.error(`evidence-bundle: ${error.message}`);
    return 2;
  }

  const validation = validateBundle(built.bundle);
  if (!validation.ok) {
    console.error('evidence-bundle: generated bundle failed its own contract:');
    for (const error of validation.errors) console.error(`  - ${error}`);
    return 2;
  }

  if (options.check) {
    const line = `✓ evidence-bundle --check: "${built.bundle.project}" builds cleanly from `
      + `${options.file} (${built.bundle.summary.level} ${built.bundle.summary.ok ? 'PASS' : 'FAIL'} `
      + `${built.bundle.summary.passed}/${built.bundle.summary.required})`;
    if (options.json) console.log(JSON.stringify({ ok: true, bundle: built.bundle }, null, 2));
    else console.log(line);
    return 0;
  }

  if (options.write) {
    const outFile = path.resolve(root, options.out);
    const reportFile = path.resolve(root, options.reportOut);
    if (!insideRoot(root, outFile) || !insideRoot(root, reportFile)) {
      console.error('evidence-bundle: --out and --report-out must stay inside the project root');
      return 2;
    }
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(built.bundle, null, 2)}\n`);
    fs.writeFileSync(reportFile, built.markdown);
    console.log(`✓ evidence-bundle: wrote ${path.relative(root, outFile)} and ${path.relative(root, reportFile)}`);
    return 0;
  }

  if (options.json) console.log(JSON.stringify(built.bundle, null, 2));
  else process.stdout.write(built.markdown);
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { buildBundle, collectControlLeaves, parseArgs, renderReportIndex, validateBundle };
