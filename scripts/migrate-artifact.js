#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'registry.json'), 'utf8'));

const schemaHints = {
  'stack-config': '../buaflow/schemas/stack-config.schema.json',
  'readiness-manifest': '../../buaflow/schemas/readiness-manifest.schema.json',
  'prototype-flow': '../../../buaflow/schemas/prototype-flow.schema.json',
  'pixel-config': '../../buaflow/schemas/pixel-config.schema.json',
  'project-manifest': '../buaflow/schemas/project-manifest.schema.json',
  'product-graph': '../../buaflow/schemas/product-graph.schema.json',
  'application-profile': '../../buaflow/schemas/application-profile.schema.json',
  'pack': '../../buaflow/schemas/pack.schema.json',
  'evidence-bundle': '../../buaflow/schemas/evidence-bundle.schema.json',
};

function definition(type) {
  return registry.artifacts.find((item) => item.type === type && item.classification === 'public') || null;
}

// Canonical form is the declared version plus the right $schema hint, with every other
// field left exactly as the author wrote it — a migrator that reorders or reshapes content
// it does not understand is a migrator nobody can review.
function canonicalize(value, type, version) {
  const { $schema: ignoredSchema, schemaVersion: ignoredVersion, ...content } = value;
  return {
    $schema: schemaHints[type],
    schemaVersion: version,
    ...content,
  };
}

function migrateArtifact(value, options) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('artifact must be a JSON object');
  const def = definition(options.type);
  if (!def) throw new Error(`unknown or non-public artifact type: ${options.type}`);
  const target = options.to || def.latestVersion;
  if (target !== def.latestVersion) {
    throw new Error(`unsupported target ${target} for ${options.type}; latest supported is ${def.latestVersion}`);
  }

  const from = value.schemaVersion || 'unversioned';

  // Already at the target: only the canonical shape is enforced, never a transform. This
  // runs before the migration-policy check below so that an artifact of a manually
  // migrated type can still be checked for canonical form.
  if (from === target) {
    const migrated = canonicalize(value, options.type, target);
    return {
      type: options.type,
      fromVersion: from,
      toVersion: target,
      changed: JSON.stringify(value) !== JSON.stringify(migrated),
      value: migrated,
    };
  }

  // Types the registry marks "manual" cannot be transformed by a program, and saying so is
  // the point. pack 1.0 -> 2.0 is the case that introduced this: v2 requires a `setup`
  // recipe — the framework owner's own CLI commands — which v1 never recorded anywhere,
  // because v1 assumed a generator would write the files itself. There is nothing in a v1
  // pack to derive those commands from, so the honest answer is to refuse and let a human
  // (or an agent, with the reference app in front of it) write the recipe. See D-011.
  if (def.migration === 'manual') {
    throw new Error(
      `${options.type} ${from} -> ${target} is a manual migration; ` +
      'no deterministic transform exists, so the artifact must be rewritten by hand against the new schema'
    );
  }

  if (from !== 'unversioned' && from !== '1.0') {
    throw new Error(`unsupported source version ${from} for ${options.type}; upgrade Buaflow before migrating`);
  }

  const migrated = canonicalize(value, options.type, target);
  const changed = JSON.stringify(value) !== JSON.stringify(migrated);
  return { type: options.type, fromVersion: from, toVersion: target, changed, value: migrated };
}

function parseArgs(argv) {
  const options = { type: null, file: null, to: null, write: false, check: false, json: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--type') options.type = argv[++index];
    else if (arg === '--file') options.file = argv[++index];
    else if (arg === '--to') options.to = argv[++index];
    else if (arg === '--write') options.write = true;
    else if (arg === '--check') options.check = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.help && !options.type) throw new Error('--type is required');
  if (!options.help && !options.file) throw new Error('--file is required');
  if (options.write && options.check) throw new Error('--write and --check cannot be used together');
  return options;
}

function atomicWrite(file, value) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`migrate-artifact: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node scripts/migrate-artifact.js --type <type> --file <path> [--to 1.0] [--check | --write] [--json]');
    return 0;
  }

  const file = path.resolve(process.cwd(), options.file);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`migrate-artifact: cannot read ${options.file}: ${error.message}`);
    return 2;
  }

  let result;
  try {
    result = migrateArtifact(value, options);
  } catch (error) {
    console.error(`migrate-artifact: ${error.message}`);
    return 2;
  }

  if (options.check) {
    if (options.json) console.log(JSON.stringify({ ...result, value: undefined }, null, 2));
    else console.log(`${options.type}: ${result.changed ? `needs migration (${result.fromVersion} -> ${result.toVersion})` : `canonical (${result.toVersion})`}`);
    return result.changed ? 1 : 0;
  }

  if (options.write) {
    if (result.changed) atomicWrite(file, result.value);
    if (options.json) console.log(JSON.stringify({ ...result, value: undefined, file: options.file }, null, 2));
    else console.log(`${options.type}: ${result.changed ? `migrated ${result.fromVersion} -> ${result.toVersion}` : `already ${result.toVersion}`} (${options.file})`);
  } else if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    process.stdout.write(`${JSON.stringify(result.value, null, 2)}\n`);
  }
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { atomicWrite, canonicalize, definition, migrateArtifact, parseArgs };
