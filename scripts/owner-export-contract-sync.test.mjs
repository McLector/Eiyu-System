// Pure unit tests for the manifest -> contract generator. No database, Docker or network.
// Run: node --test scripts/owner-export-contract-sync.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseManifest,
  contractFields,
  renderContractSource,
  readContractFields,
  diffManifests,
  normalizeManifest,
  diffContractFields,
} from './lib/owner-export-contract-sync.mjs';

const owner = (table, exportFields, extra = {}) => ({ table, export: exportFields, exclude: [], scope: 'owner', ...extra });
const manifest = (tables, foreignKeys = []) => ({ tables, foreignKeys });
const base = () => manifest([
  owner('public.habits', ['id', 'user_id', 'name']),
  owner('private.tracker_retention_state', ['user_id', 'removed_at']),
  { table: 'private.ai_provider_attempts', export: ['request_id', 'attempt_number'], exclude: [], scope: 'indirect' },
  { table: 'private.tracker_open_settings', export: [], exclude: ['singleton'], scope: 'global' },
], [{ source: 'public.habits', definition: 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE' }]);

const CONTRACT = [
  '// header kept by hand',
  'export function isOwnerExportDocument(){return true;}',
  'export const OWNER_EXPORT_MAX_BYTES=5242880;',
  'export const OWNER_EXPORT_SECTION_FIELDS:Readonly<Record<string,readonly string[]>>={',
  '  "public.habits": [',
  '    "id"',
  '  ]',
  '};',
  '',
].join('\n');

test('contractFields keeps owner and indirect tables, drops global ones, keeps manifest order', () => {
  const fields = contractFields(base());
  assert.deepEqual(Object.keys(fields), ['public.habits', 'private.tracker_retention_state', 'private.ai_provider_attempts']);
  assert.deepEqual(fields['private.tracker_retention_state'], ['user_id', 'removed_at']);
  assert.ok(!('private.tracker_open_settings' in fields), 'global settings are not owner data');
});

test('parseManifest accepts a well-formed manifest and returns it unchanged in content', () => {
  assert.deepEqual(parseManifest(JSON.stringify(base())), base());
});

test('parseManifest rejects text that is not JSON', () => {
  assert.throws(() => parseManifest('not json'), /manifest/i);
  assert.throws(() => parseManifest(''), /manifest/i);
});

test('parseManifest rejects the wrong top-level shape', () => {
  for (const bad of [null, [], 'x', {}, { tables: 'x' }, { tables: [] }, { tables: [owner('public.a', ['id'])] }]) {
    assert.throws(() => parseManifest(JSON.stringify(bad)), /manifest/i, JSON.stringify(bad));
  }
});

test('parseManifest rejects unsafe or malformed table names', () => {
  for (const name of ['habits', 'public.', 'public.a;drop', 'Public.a', 'public.a b', "public.a'", '', 5]) {
    const m = base();
    m.tables[0].table = name;
    assert.throws(() => parseManifest(JSON.stringify(m)), /table/i, String(name));
  }
});

test('parseManifest rejects duplicate tables', () => {
  const m = base();
  m.tables.push(owner('public.habits', ['id']));
  assert.throws(() => parseManifest(JSON.stringify(m)), /duplicate/i);
});

test('parseManifest rejects an unknown scope', () => {
  const m = base();
  m.tables[0].scope = 'everyone';
  assert.throws(() => parseManifest(JSON.stringify(m)), /scope/i);
});

test('parseManifest rejects export lists that are not unique column names', () => {
  for (const bad of ['id', [1], ['id', 'id'], ['bad name'], ['a"b'], [null]]) {
    const m = base();
    m.tables[0].export = bad;
    assert.throws(() => parseManifest(JSON.stringify(m)), /export/i, JSON.stringify(bad));
  }
});

test('parseManifest rejects a global table that exports columns (the contract would drop them silently)', () => {
  const m = base();
  m.tables[3].export = ['singleton'];
  assert.throws(() => parseManifest(JSON.stringify(m)), /global/i);
});

test('parseManifest rejects an owner table that exports nothing', () => {
  const m = base();
  m.tables[0].export = [];
  assert.throws(() => parseManifest(JSON.stringify(m)), /export/i);
});

test('normalizeManifest fixes key order so regenerated files diff cleanly', () => {
  const shuffled = manifest([{ scope: 'owner', exclude: [], export: ['id'], table: 'public.a' }]);
  assert.deepEqual(Object.keys(normalizeManifest(shuffled).tables[0]), ['table', 'export', 'exclude', 'scope']);
  assert.deepEqual(Object.keys(normalizeManifest({ foreignKeys: [], tables: shuffled.tables })), ['tables', 'foreignKeys']);
});

test('renderContractSource replaces only the field constant and keeps the hand-written code', () => {
  const out = renderContractSource(CONTRACT, base());
  assert.ok(out.startsWith('// header kept by hand\nexport function isOwnerExportDocument(){return true;}\nexport const OWNER_EXPORT_MAX_BYTES=5242880;\n'));
  assert.deepEqual(readContractFields(out), contractFields(base()));
});

test('renderContractSource is idempotent', () => {
  const once = renderContractSource(CONTRACT, base());
  assert.equal(renderContractSource(once, base()), once);
});

test('renderContractSource refuses a file with no field constant, rather than appending a second one', () => {
  assert.throws(() => renderContractSource('export const x=1;\n', base()), /OWNER_EXPORT_SECTION_FIELDS/);
});

test('renderContractSource refuses a file with two field constants', () => {
  assert.throws(() => renderContractSource(CONTRACT + CONTRACT, base()), /OWNER_EXPORT_SECTION_FIELDS/);
});

test('readContractFields reads what the generator wrote and rejects garbage', () => {
  assert.deepEqual(readContractFields(CONTRACT), { 'public.habits': ['id'] });
  assert.throws(() => readContractFields('export const OWNER_EXPORT_SECTION_FIELDS:X={ not json };'), /OWNER_EXPORT_SECTION_FIELDS/);
  assert.throws(() => readContractFields('nothing here'), /OWNER_EXPORT_SECTION_FIELDS/);
});

test('diffManifests reports nothing for identical content, even when table order differs', () => {
  const reordered = base();
  reordered.tables.reverse();
  assert.deepEqual(diffManifests(base(), reordered), []);
});

test('diffManifests names a table the saved copy is missing (the 38-versus-34 bug)', () => {
  const saved = base();
  saved.tables.splice(1, 1);
  const out = diffManifests(saved, base());
  assert.equal(out.length, 1);
  assert.match(out[0], /private\.tracker_retention_state/);
  assert.match(out[0], /missing/i);
});

test('diffManifests names a table the database no longer has', () => {
  const live = base();
  live.tables.splice(1, 1);
  const out = diffManifests(base(), live);
  assert.match(out.join('\n'), /private\.tracker_retention_state/);
  assert.match(out.join('\n'), /no longer/i);
});

test('diffManifests names added and removed columns', () => {
  const live = base();
  live.tables[0].export = ['id', 'user_id', 'color'];
  const text = diffManifests(base(), live).join('\n');
  assert.match(text, /public\.habits/);
  assert.match(text, /\+color/);
  assert.match(text, /-name/);
});

test('diffManifests notices a changed scope, exclude list or foreign key', () => {
  const live = base();
  live.tables[2].scope = 'owner';
  live.tables[3].exclude = ['singleton', 'go_live_at'];
  live.foreignKeys = [];
  const text = diffManifests(base(), live).join('\n');
  assert.match(text, /private\.ai_provider_attempts.*scope/);
  assert.match(text, /private\.tracker_open_settings.*exclude/);
  assert.match(text, /foreign key/i);
});

test('diffContractFields is empty when the contract already matches the manifest', () => {
  assert.deepEqual(diffContractFields(contractFields(base()), base()), []);
});

test('diffContractFields names tables and columns the contract lacks or should not have', () => {
  const stale = contractFields(base());
  delete stale['private.tracker_retention_state'];
  stale['public.habits'] = ['id', 'user_id', 'old_column'];
  stale['public.gone'] = ['id'];
  const text = diffContractFields(stale, base()).join('\n');
  assert.match(text, /private\.tracker_retention_state.*missing/i);
  assert.match(text, /public\.habits.*\+name.*-old_column/);
  assert.match(text, /public\.gone.*not in the database/i);
});

test('diffContractFields treats a column order change as a difference (the validator compares exact key sets, but regeneration should still be clean)', () => {
  const stale = contractFields(base());
  stale['public.habits'] = ['name', 'user_id', 'id'];
  assert.match(diffContractFields(stale, base()).join('\n'), /public\.habits.*reordered/);
});
