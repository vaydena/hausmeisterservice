import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/** Strip -- line comments and block comments so regex only hits real SQL. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => ({
    file: f,
    sql: stripSqlComments(readFileSync(join(MIGRATIONS_DIR, f), 'utf8')),
  }));

const CREATE_TABLE_RE =
  /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_.]*)\s*\(/gi;

const ALTER_TABLE_RE =
  /\balter\s+table\s+(?:if\s+exists\s+)?([a-z_][a-z0-9_.]*)/gi;

/**
 * Postgres accepts both quoted (`"name"`) and unquoted (`name`) policy
 * identifiers. Both are used in our migrations.
 */
const CREATE_POLICY_RE =
  /\bcreate\s+policy\s+(?:"[^"]+"|[a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_.]*)/gi;

const CREATE_TRIGGER_RE =
  /\bcreate\s+(?:or\s+replace\s+)?trigger\s+[a-z_][a-z0-9_]*\s+[\s\S]*?\bon\s+([a-z_][a-z0-9_.]*)/gi;

const CREATE_INDEX_RE =
  /\bcreate\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?[a-z_][a-z0-9_]*\s+on\s+(?:only\s+)?([a-z_][a-z0-9_.]*)/gi;

/**
 * Normalize an identifier into (schema, name). Bare names default to public.
 */
function qualify(raw: string): { schema: string; name: string } {
  const parts = raw.toLowerCase().split('.');
  if (parts.length === 1) return { schema: 'public', name: parts[0]! };
  return { schema: parts[0]!, name: parts[1]! };
}

function lineOf(sql: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < sql.length; i++) {
    if (sql[i] === '\n') line++;
  }
  return line;
}

interface TableRef {
  kind: 'alter' | 'policy' | 'trigger' | 'index';
  name: string;
  file: string;
  line: number;
}

const CREATED = new Map<string, string>(); // public.name → file where first declared
const REFS: TableRef[] = [];

for (const { file, sql } of MIGRATIONS) {
  for (const m of sql.matchAll(CREATE_TABLE_RE)) {
    const { schema, name } = qualify(m[1]!);
    if (schema !== 'public') continue;
    if (!CREATED.has(name)) CREATED.set(name, file);
  }

  const scan = (rex: RegExp, kind: TableRef['kind']) => {
    for (const m of sql.matchAll(rex)) {
      const { schema, name } = qualify(m[1]!);
      if (schema !== 'public') continue;
      REFS.push({ kind, name, file, line: lineOf(sql, m.index ?? 0) });
    }
  };

  scan(ALTER_TABLE_RE, 'alter');
  scan(CREATE_POLICY_RE, 'policy');
  scan(CREATE_TRIGGER_RE, 'trigger');
  scan(CREATE_INDEX_RE, 'index');
}

/**
 * Tables that live in the remote Supabase DB but were created outside the
 * versioned SQL migration folder — typically via the Supabase MCP
 * `apply_migration` tool during an early bootstrap. They still need to be
 * referenced by follow-up migrations (RLS, indexes, policies), but a bare
 * "table not declared here" check would false-positive.
 *
 * Rationale per entry:
 *  - `residents`: seeded via Supabase MCP apply_migration during the resident-
 *    portal bootstrap; the follow-up `20260803001500_resident_portal.sql`
 *    adds portal-specific columns, indexes and policies to the existing
 *    remote table. Do NOT add a `create table residents (...)` here without
 *    coordinating with the remote schema — the migration would fail on a
 *    fresh `supabase db reset`.
 *
 * The test asserts entries are still stale-relevant: once a `create table X`
 * appears in the SQL folder, the allowlist entry becomes an error, forcing
 * removal.
 */
const INTENTIONALLY_EXTERNAL = new Set<string>(['residents']);

describe('Migration table existence coverage', () => {
  describe('sanity: extractors found something', () => {
    it('scanner discovered CREATE TABLE statements in public.*', () => {
      expect(CREATED.size).toBeGreaterThan(0);
    });
    it('scanner discovered public.* references (alter/policy/trigger/index)', () => {
      expect(REFS.length).toBeGreaterThan(0);
    });
  });

  describe('every referenced public.* table is created by a migration (or externally allowlisted)', () => {
    const REFERENCED = new Map<string, TableRef>();
    for (const r of REFS) if (!REFERENCED.has(r.name)) REFERENCED.set(r.name, r);

    for (const [name, first] of [...REFERENCED.entries()].sort()) {
      it(`table "public.${name}" (first referenced by ${first.kind} in ${first.file}:${first.line}) has a create table (or is in INTENTIONALLY_EXTERNAL)`, () => {
        if (INTENTIONALLY_EXTERNAL.has(name)) {
          expect(
            CREATED.has(name),
            `"${name}" is in INTENTIONALLY_EXTERNAL but a "create table ${name}" now exists in ${CREATED.get(name)}. Remove the allowlist entry so this table is guarded like any other.`,
          ).toBe(false);
          return;
        }
        expect(
          CREATED.has(name),
          `Migration ${first.file}:${first.line} performs a ${first.kind} on public.${name}, but no earlier migration contains "create table ${name}" (or "create table public.${name}"). A fresh "supabase db reset" would abort with "relation \\"${name}\\" does not exist". Either add the missing CREATE TABLE in an earlier migration, fix the identifier if it is a typo, or (only for tables bootstrapped remotely outside the SQL folder) add "${name}" to INTENTIONALLY_EXTERNAL with a written rationale.`,
        ).toBe(true);
      });
    }
  });
});
