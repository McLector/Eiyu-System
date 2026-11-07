// Keeps the owner-export contract in step with the database manifest.
//
//   node scripts/owner-export-contract.mjs --check   [--container NAME]   fail if anything drifted (default)
//   node scripts/owner-export-contract.mjs --write   [--container NAME]   regenerate both files from the database
//
// Source of truth: private.owner_export_manifest() in the local Postgres container (Docker, read-only query).
// Generated files: scripts/fixtures/owner-export-manifest.json and the OWNER_EXPORT_SECTION_FIELDS constant
// in packages/shared/src/data/owner-export-contract.ts. Never edit those two by hand.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  contractFields,
  diffContractFields,
  diffManifests,
  diffObjectColumns,
  normalizeManifest,
  parseManifest,
  readContractFields,
  readObjectColumns,
  renderContractSource,
} from './lib/owner-export-contract-sync.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = join(root, 'scripts/fixtures/owner-export-manifest.json');
const contractPath = join(root, 'packages/shared/src/data/owner-export-contract.ts');
const WINDOWS_DOCKER = join(process.env.LOCALAPPDATA ?? '', 'Programs/DockerDesktop/resources/bin/docker.exe');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const write = process.argv.includes('--write');
const container = option('--container', 'supabase_db_eiyu-system');
if (!/^[A-Za-z0-9_.-]+$/.test(container)) {
  console.error('The container name may only contain letters, digits, underscore, dot and dash.');
  process.exit(2);
}
const docker = process.env.DOCKER_CLI ?? (existsSync(WINDOWS_DOCKER) ? WINDOWS_DOCKER : 'docker');

function psql(sql) {
  try {
    return execFileSync(
      docker,
      ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 16 * 1024 * 1024 },
    ).trim();
  } catch (error) {
    const detail = String(error.stderr ?? error.message).split('\n').find(Boolean) ?? 'unknown error';
    console.error(`Could not read from container "${container}": ${detail}`);
    console.error('Start the local database first (npm run db:start) or pass --container with a running Supabase database container.');
    process.exit(2);
  }
}

function liveManifest() {
  return normalizeManifest(parseManifest(psql('select private.owner_export_manifest()')));
}

// Exported columns whose database type is json/jsonb: the validator only accepts scalars and arrays of scalars unless allowed.
function liveJsonColumns() {
  const sql = `with m as (select e->>'table' t, jsonb_array_elements_text(e->'export') c
    from jsonb_array_elements(private.owner_export_manifest()->'tables') e where e->>'scope'<>'global')
    select m.t||'.'||m.c from m join information_schema.columns k
      on k.table_schema=split_part(m.t,'.',1) and k.table_name=split_part(m.t,'.',2) and k.column_name=m.c
    where k.data_type in ('json','jsonb') order by 1`;
  return psql(sql).split('\n').filter(Boolean);
}

const live = liveManifest();
const jsonColumns = liveJsonColumns();

if (write) {
  const saved = JSON.parse(readFileSync(fixturePath, 'utf8'));
  writeFileSync(fixturePath, `${JSON.stringify(live, null, 2)}\n`);
  writeFileSync(contractPath, renderContractSource(readFileSync(contractPath, 'utf8'), live));
  const nonGlobal = Object.keys(contractFields(live)).length;
  console.log(`Wrote the fixture (${live.tables.length} tables) and the contract (${nonGlobal} owner sections) from ${container}.`);
  const objectProblems = diffObjectColumns(jsonColumns, readObjectColumns(readFileSync(contractPath, 'utf8')));
  for (const line of objectProblems) console.error(`  PROBLEM: ${line}`);
  const changes = diffManifests(saved, live);
  for (const line of changes) console.log(`  changed: ${line}`);
  if (changes.length === 0) console.log('  nothing changed.');
  process.exit(objectProblems.length ? 1 : 0);
}

const problems = [];
const saved = parseManifest(readFileSync(fixturePath, 'utf8'));
for (const line of diffManifests(saved, live)) problems.push(`fixture: ${line}`);
for (const line of diffContractFields(readContractFields(readFileSync(contractPath, 'utf8')), live)) problems.push(`contract: ${line}`);
for (const line of diffObjectColumns(jsonColumns, readObjectColumns(readFileSync(contractPath, 'utf8')))) problems.push(`contract: ${line}`);

if (problems.length === 0) {
  console.log(`Owner export contract matches the database manifest (${container}).`);
  process.exit(0);
}
console.error(`The owner export contract has drifted from the database manifest (${container}):`);
for (const line of problems) console.error(`  - ${line}`);
console.error('\nRegenerate it with: node scripts/owner-export-contract.mjs --write --container ' + container);
process.exit(1);
