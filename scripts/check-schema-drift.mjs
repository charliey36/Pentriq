#!/usr/bin/env node
/**
 * Compares what the code expects of the database with what the migrations actually create.
 *
 *   node scripts/check-schema-drift.mjs <columns.json>
 *
 * <columns.json> is produced by scripts/verify-db.sh (it dumps every public table's columns after applying all
 * migrations). Checks, all against that real schema:
 *   1. every column named in a Supabase .select('...') string, or in a filter/order call (.eq('col', ...),
 *      .order('col'), .in('col', ...), ...), exists on the table named in the same .from('table') chain;
 *   2. every table and column declared in the hand-written src/lib/database.types.ts exists;
 *   3. (warning only) columns the database has that the types do not declare.
 * PostgREST answers a query naming a missing column with an error, and most callers degrade quietly, so these
 * mistakes otherwise surface only as "empty" screens in production.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const schemaPath = process.argv[2];
if (!schemaPath) {
  console.error('usage: node scripts/check-schema-drift.mjs <columns.json>');
  process.exit(2);
}
/** @type {Record<string, string[]>} */
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const tables = new Map(Object.entries(schema).map(([t, cols]) => [t, new Set(cols)]));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** Splits a select string on commas that are not inside parentheses. */
function splitTop(s) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const errors = [];
const warnings = [];

/** Checks a PostgREST select list against `table`, recursing into embedded resources. */
function checkSelect(table, list, where) {
  const cols = tables.get(table);
  if (!cols) return;
  for (const item of splitTop(list)) {
    const embed = item.match(/^(?:[a-zA-Z_]+:)?([a-zA-Z_]+)(?:![a-zA-Z_]+)?\s*\(([\s\S]*)\)$/);
    if (embed) {
      const [, related, inner] = embed;
      if (tables.has(related)) checkSelect(related, inner, where);
      else if (related !== 'count') errors.push(`${where}: embedded resource "${related}" is not a table`);
      continue;
    }
    const col = item.replace(/^[a-zA-Z_]+:/, '').replace(/::[a-z]+$/, '').replace(/->>?.*$/, '').trim();
    if (col === '*' || col === 'count' || col === '') continue;
    if (!cols.has(col)) errors.push(`${where}: ${table}.${col} does not exist`);
  }
}

const FILTERS = 'eq|neq|gt|gte|lt|lte|in|is|not|like|ilike|contains|containedBy|order|match';

for (const file of walk(join(root, 'src'))) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(root, file);
  const fromRe = /\.from\(\s*'([a-z_]+)'\s*\)/g;
  let m;
  while ((m = fromRe.exec(text))) {
    const table = m[1];
    const line = text.slice(0, m.index).split('\n').length;
    const where = `${rel}:${line}`;
    if (!tables.has(table)) {
      // Storage buckets use .from('bucket') on supabase.storage, not tables.
      if (!/storage\s*\.\s*$/.test(text.slice(Math.max(0, m.index - 30), m.index))) errors.push(`${where}: table "${table}" does not exist`);
      continue;
    }
    // The chain runs until the end of the statement, or the next .from( (whichever comes first).
    const rest = text.slice(fromRe.lastIndex);
    const stop = Math.min(...[rest.indexOf(';'), rest.search(/\.from\(/), 1500].filter((i) => i >= 0));
    const chain = rest.slice(0, stop);
    const sel = chain.match(/\.select\(\s*'([^']*)'/) ?? chain.match(/\.select\(\s*`([^`$]*)`/);
    if (sel) checkSelect(table, sel[1], where);
    const filterRe = new RegExp(`\\.(?:${FILTERS})\\(\\s*'([a-z_]+)'`, 'g');
    let f;
    while ((f = filterRe.exec(chain))) {
      if (!tables.get(table).has(f[1])) errors.push(`${where}: filter/order column ${table}.${f[1]} does not exist`);
    }
  }
}

// --- database.types.ts ---------------------------------------------------------------------------------------
const types = readFileSync(join(root, 'src/lib/database.types.ts'), 'utf8');
const tablesStart = types.indexOf('Tables: {');
const tableRe = /\n {6}([a-z_]+): \{\n {8}Row: \{/g;
tableRe.lastIndex = tablesStart;
let t;
while ((t = tableRe.exec(types))) {
  const table = t[1];
  // Read the Row object, tracking nested braces so keys of nested object types are not mistaken for columns.
  let i = tableRe.lastIndex;
  let depth = 1;
  const keys = [];
  let token = '{';
  while (i < types.length && depth > 0) {
    const ch = types[i];
    if (ch === '{' || ch === '<' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === '>' || ch === ')' || ch === ']') depth--;
    if (depth === 1) {
      token += ch;
      const k = token.match(/(?:^|[;\n{]\s*|\*\/\s*)([a-z_]+)\??:\s*$/);
      if (k) {
        keys.push(k[1]);
        token = '';
      }
      if (ch === ';' || ch === '\n') token = ch;
    }
    i++;
  }
  const cols = tables.get(table);
  if (!cols) {
    errors.push(`database.types.ts: table "${table}" does not exist in the migrated schema`);
    continue;
  }
  for (const k of new Set(keys)) if (!cols.has(k)) errors.push(`database.types.ts: ${table}.${k} does not exist`);
  for (const c of cols) if (!keys.includes(c)) warnings.push(`database.types.ts: ${table}.${c} exists but is not declared`);
}

for (const w of warnings) console.log(`warning  ${w}`);
for (const e of errors) console.log(`ERROR    ${e}`);
console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
