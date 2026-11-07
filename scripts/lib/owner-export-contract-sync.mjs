// Pure helpers that tie the TypeScript export contract to the database manifest.
// `private.owner_export_manifest()` is the source of truth: the reviewed fixture and the
// OWNER_EXPORT_SECTION_FIELDS constant are generated from it, never edited by hand.
// No file, database or network access here, so these run in CI.

const TABLE = /^(?:public|private)\.[a-z_][a-z0-9_]*$/;
const COLUMN = /^[a-z_][a-z0-9_]*$/;
const SCOPES = new Set(['owner', 'indirect', 'global']);
const CONSTANT = 'OWNER_EXPORT_SECTION_FIELDS';
const CONSTANT_DECLARATION = `export const ${CONSTANT}`;
const CONSTANT_TYPE = 'Readonly<Record<string,readonly string[]>>';

function fail(message) {
  throw new Error(`Owner export manifest: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && COLUMN.test(item)) && new Set(value).size === value.length;
}

/** Parse and validate the manifest JSON returned by the database. */
export function parseManifest(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail('the database did not return valid JSON');
  }
  if (!isRecord(value) || !Array.isArray(value.tables) || value.tables.length === 0 || !Array.isArray(value.foreignKeys)) {
    fail('expected an object with a non-empty "tables" list and a "foreignKeys" list');
  }
  const seen = new Set();
  for (const spec of value.tables) {
    if (!isRecord(spec) || typeof spec.table !== 'string' || !TABLE.test(spec.table)) {
      fail(`bad table name ${JSON.stringify(isRecord(spec) ? spec.table : spec)}`);
    }
    if (seen.has(spec.table)) fail(`duplicate table ${spec.table}`);
    seen.add(spec.table);
    if (!SCOPES.has(spec.scope)) fail(`${spec.table} has an unknown scope ${JSON.stringify(spec.scope)}`);
    if (!stringList(spec.export)) fail(`${spec.table} needs "export" to be a list of unique column names`);
    if (!stringList(spec.exclude)) fail(`${spec.table} needs "exclude" to be a list of unique column names`);
    if (spec.scope === 'global' && spec.export.length > 0) {
      fail(`${spec.table} is global but exports columns; the contract would drop them silently`);
    }
    if (spec.scope !== 'global' && spec.export.length === 0) fail(`${spec.table} exports no columns`);
  }
  return value;
}

/** Same content with stable key order, so regenerated files diff cleanly. */
export function normalizeManifest(manifest) {
  return {
    tables: manifest.tables.map((spec) => ({ table: spec.table, export: spec.export, exclude: spec.exclude, scope: spec.scope })),
    foreignKeys: manifest.foreignKeys,
  };
}

/** table -> exported columns, for everything the owner can download (global settings are not owner data). */
export function contractFields(manifest) {
  const fields = {};
  for (const spec of manifest.tables) {
    if (spec.scope !== 'global') fields[spec.table] = [...spec.export];
  }
  return fields;
}

function locateConstant(source) {
  const first = source.indexOf(CONSTANT_DECLARATION);
  if (first === -1 || source.indexOf(CONSTANT_DECLARATION, first + 1) !== -1) {
    throw new Error(`Export contract: expected exactly one "${CONSTANT_DECLARATION}" declaration`);
  }
  const open = source.indexOf('={', first);
  if (open === -1) throw new Error(`Export contract: could not find the object after ${CONSTANT}`);
  let depth = 0;
  for (let i = open + 1; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        const end = source[i + 1] === ';' ? i + 2 : i + 1;
        return { first, open: open + 1, close: i + 1, end };
      }
    }
  }
  throw new Error(`Export contract: the object after ${CONSTANT} is not closed`);
}

/** Replace only the generated constant; the hand-written validator above it stays as it is. */
export function renderContractSource(source, manifest) {
  const { first, end } = locateConstant(source);
  const body = JSON.stringify(contractFields(manifest), null, 2);
  return `${source.slice(0, first)}${CONSTANT_DECLARATION}:${CONSTANT_TYPE}=${body};${source.slice(end)}`;
}

/** Read the constant back out of the contract source. */
export function readContractFields(source) {
  const { open, close } = locateConstant(source);
  try {
    const value = JSON.parse(source.slice(open, close));
    if (!isRecord(value)) throw new Error('not an object');
    return value;
  } catch {
    throw new Error(`Export contract: ${CONSTANT} is not plain JSON, so it cannot be compared`);
  }
}

function sameList(a, b) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function foreignKeyId(fk) {
  return `${fk.source} :: ${fk.definition}`;
}

/** Human-readable differences between a saved manifest and the live one. Empty means they agree. */
export function diffManifests(saved, live) {
  const out = [];
  const savedBy = new Map(saved.tables.map((spec) => [spec.table, spec]));
  const liveBy = new Map(live.tables.map((spec) => [spec.table, spec]));
  for (const [table, spec] of liveBy) {
    const old = savedBy.get(table);
    if (!old) {
      out.push(`${table} is missing from the saved copy (${spec.scope}, ${spec.export.length} exported columns)`);
      continue;
    }
    if (old.scope !== spec.scope) out.push(`${table}: scope changed from ${old.scope} to ${spec.scope}`);
    if (!sameList(old.export, spec.export)) {
      const added = spec.export.filter((c) => !old.export.includes(c)).map((c) => `+${c}`);
      const removed = old.export.filter((c) => !spec.export.includes(c)).map((c) => `-${c}`);
      const moved = added.length + removed.length === 0 ? ['reordered'] : [];
      out.push(`${table}: exported columns changed (${[...added, ...removed, ...moved].join(' ')})`);
    }
    if (!sameList(old.exclude, spec.exclude)) out.push(`${table}: exclude list changed`);
  }
  for (const table of savedBy.keys()) {
    if (!liveBy.has(table)) out.push(`${table} is in the saved copy but the database no longer lists it`);
  }
  const savedFks = new Set(saved.foreignKeys.map(foreignKeyId));
  const liveFks = new Set(live.foreignKeys.map(foreignKeyId));
  const addedFks = [...liveFks].filter((id) => !savedFks.has(id));
  const removedFks = [...savedFks].filter((id) => !liveFks.has(id));
  if (addedFks.length || removedFks.length) {
    out.push(`foreign keys changed (${addedFks.length} added, ${removedFks.length} removed)`);
  }
  return out;
}

/** Differences between the contract's field lists and what the manifest says they should be. */
export function diffContractFields(saved, manifest) {
  const expected = contractFields(manifest);
  const out = [];
  for (const [table, fields] of Object.entries(expected)) {
    const old = saved[table];
    if (!old) {
      out.push(`${table} is missing from the contract (${fields.length} columns)`);
      continue;
    }
    if (sameList(old, fields)) continue;
    const added = fields.filter((c) => !old.includes(c)).map((c) => `+${c}`);
    const removed = old.filter((c) => !fields.includes(c)).map((c) => `-${c}`);
    const detail = added.length + removed.length === 0 ? 'reordered' : [...added, ...removed].join(' ');
    out.push(`${table}: contract columns differ (${detail})`);
  }
  for (const table of Object.keys(saved)) {
    if (!(table in expected)) out.push(`${table} is in the contract but not in the database manifest`);
  }
  return out;
}
