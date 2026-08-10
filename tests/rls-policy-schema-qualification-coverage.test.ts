import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

/**
 * `create policy <name> on <target>` — capture the target as-written so we
 * can reason about its schema qualifier. Postgres accepts three shapes:
 *  - unqualified: `on foo`         (resolved via search_path, default "public")
 *  - schema-qualified: `on public.foo` / `on storage.foo`
 *  - db-qualified: `on mydb.public.foo`  (parser accepts it in some places)
 * We treat 3+-part names as an anomaly because none of our migrations
 * should ever cross-DB-reference.
 */
const POLICY_ON_TABLE_RE =
  /create\s+policy\s+(?:"[^"]+"|[a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_.]*)/gi;

/**
 * Schemas we allow policy targets to live in.
 *  - `public`: our own schema, either explicit or implicit via search_path.
 *  - `storage`: Supabase Storage — we add policies to `storage.objects` so
 *    the storage-facing REST endpoints enforce tenant scope. See the
 *    external-RLS allowlist in `rls-enable-statement-coverage.test.ts`
 *    for why enabling RLS on storage tables lives out-of-band.
 *
 * Notably NOT allowed:
 *  - `auth.*`: Supabase-managed. Adding a policy on `auth.users` from our
 *    migrations would either permission-deny or, worse, silently override
 *    Supabase-internal semantics that other Auth flows rely on.
 *  - `pg_catalog.*`, `information_schema.*`: system schemas; policies on
 *    them are a strong indicator of a typo or a copy-paste from somewhere
 *    external.
 *  - any other schema (e.g. `graphql.*`, extension-owned schemas): if we
 *    ever legitimately need one, add it here with a written rationale.
 */
const ALLOWED_SCHEMAS = new Set<string>(['<implicit>', 'public', 'storage']);

interface PolicyTarget {
  file: string;
  raw: string;
  schema: string;
  table: string;
}

function classify(raw: string): { schema: string; table: string } {
  const parts = raw.toLowerCase().split('.');
  if (parts.length === 1) return { schema: '<implicit>', table: parts[0]! };
  if (parts.length === 2) return { schema: parts[0]!, table: parts[1]! };
  return { schema: '<multi-part>', table: raw.toLowerCase() };
}

const ALL_TARGETS: PolicyTarget[] = [];
for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  for (const m of sql.matchAll(POLICY_ON_TABLE_RE)) {
    const raw = m[1];
    if (!raw) continue;
    const { schema, table } = classify(raw);
    ALL_TARGETS.push({ file, raw: raw.toLowerCase(), schema, table });
  }
}

/**
 * Distinct raw targets, so per-target tests give one row per unique
 * `on <raw>` shape rather than repeating for every migration file.
 */
const DISTINCT_TARGETS: PolicyTarget[] = [];
{
  const seen = new Map<string, PolicyTarget>();
  for (const t of ALL_TARGETS) {
    if (!seen.has(t.raw)) seen.set(t.raw, t);
  }
  DISTINCT_TARGETS.push(...[...seen.values()].sort((a, b) => a.raw.localeCompare(b.raw)));
}

describe('RLS policy schema qualification coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many policy targets', () => {
      expect(ALL_TARGETS.length).toBeGreaterThan(100);
    });
    it('scanner discovered many distinct policy targets', () => {
      expect(DISTINCT_TARGETS.length).toBeGreaterThan(20);
    });
  });

  describe('every policy target lives in an allowed schema', () => {
    for (const t of DISTINCT_TARGETS) {
      it(`policy target "${t.raw}" (first in ${t.file}) uses an allowed schema`, () => {
        expect(
          ALLOWED_SCHEMAS.has(t.schema),
          `Policy target "${t.raw}" uses schema "${t.schema}", which is not on the allow-list {${[...ALLOWED_SCHEMAS].join(', ')}}. First seen in ${t.file}. Two likely causes: (1) TYPO in the schema name — "publci.foo" or "storaage.objects" would parse fine here and land on this failure; fix the schema spelling. (2) Genuinely adding a policy on a NEW schema (e.g. an extension-owned one, or auth.users). Auth-schema policies are almost always wrong — Supabase manages auth.* and adding our own policies either permission-denies or silently overrides internal semantics. For other legitimate new schemas, add the schema name to ALLOWED_SCHEMAS in this test with a written rationale explaining WHY we own policies on it and confirming the schema is not Supabase-managed.`,
        ).toBe(true);
      });
    }
  });

  describe('no policy target uses a multi-part (db.schema.table) qualifier', () => {
    it('every distinct target parses as at most schema.table', () => {
      const multi = DISTINCT_TARGETS.filter((t) => t.schema === '<multi-part>');
      expect(
        multi,
        multi.length > 0
          ? `The following policy targets have 3+ dot-separated parts:\n${multi
              .map((t) => `  ${t.raw} (first in ${t.file})`)
              .join(
                '\n',
              )}\nPostgres parses \`db.schema.table\` in some contexts but a migration should never cross-database reference — the migration only runs against the local database, so a leading db qualifier is either a bug or a copy-paste from a foreign-data-wrapper example. Strip the leading db name so the target parses as \`schema.table\`.`
          : 'unexpected — extractor produced multi-part targets when none exist',
      ).toEqual([]);
    });
  });
});
