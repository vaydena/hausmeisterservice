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

/**
 * Policy-header regex: matches `create policy <name> on <table>` where the
 * name may be quoted or bare and the table may be schema-qualified. We
 * ignore everything after the table (USING/WITH CHECK/FOR-clause) because
 * this guard only cares about the target table.
 */
const POLICY_ON_TABLE_RE =
  /create\s+policy\s+(?:"[^"]+"|[a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_.]*)/gi;

/**
 * RLS-enable regex: matches `alter table [only] <table> enable row level
 * security`. Postgres also accepts `force row level security` (for tables
 * owned by superusers, so policies apply to the owner too) — we don't
 * treat FORCE as a substitute here because the plain ENABLE is what a
 * normal RLS-scoped table needs; if a migration ever legitimately uses
 * FORCE alone, add the table to INTENTIONALLY_EXTERNAL_RLS_TABLES with a
 * rationale.
 */
const ENABLE_RLS_RE =
  /alter\s+table\s+(?:only\s+)?([a-z_][a-z0-9_.]*)\s+enable\s+row\s+level\s+security/gi;

/**
 * Normalize a table identifier: lower-case, and strip the `public.` prefix
 * so `public.residents` and `residents` compare equal. Non-public
 * qualifications (`storage.objects`, `auth.users`) are preserved because
 * they are structurally different targets — `storage.objects` in
 * particular is owned by Supabase Storage, not by our schema.
 */
function normTable(raw: string): string {
  return raw.toLowerCase().replace(/^public\./, '');
}

interface PolicyRef {
  file: string;
  table: string;
}

interface EnableRef {
  file: string;
  table: string;
}

function collect(): { policies: PolicyRef[]; enables: EnableRef[] } {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const policies: PolicyRef[] = [];
  const enables: EnableRef[] = [];
  for (const file of files) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    for (const m of sql.matchAll(POLICY_ON_TABLE_RE)) {
      const raw = m[1];
      if (!raw) continue;
      policies.push({ file, table: normTable(raw) });
    }
    for (const m of sql.matchAll(ENABLE_RLS_RE)) {
      const raw = m[1];
      if (!raw) continue;
      enables.push({ file, table: normTable(raw) });
    }
  }
  return { policies, enables };
}

const { policies: ALL_POLICIES, enables: ALL_ENABLES } = collect();

/** table -> [migration files, sorted] where a policy is created on it. */
const POLICIES_BY_TABLE = new Map<string, string[]>();
for (const p of ALL_POLICIES) {
  if (!POLICIES_BY_TABLE.has(p.table)) POLICIES_BY_TABLE.set(p.table, []);
  POLICIES_BY_TABLE.get(p.table)!.push(p.file);
}

/** table -> [migration files, sorted] where enable-rls happens. */
const ENABLES_BY_TABLE = new Map<string, string[]>();
for (const e of ALL_ENABLES) {
  if (!ENABLES_BY_TABLE.has(e.table)) ENABLES_BY_TABLE.set(e.table, []);
  ENABLES_BY_TABLE.get(e.table)!.push(e.file);
}

/**
 * Tables where policies exist but RLS is not enabled by any migration in
 * `supabase/migrations/`. Each entry must document WHERE RLS is actually
 * enabled (out-of-band) and WHY it can't live in a local migration file.
 *
 *  - `storage.objects`: owned by Supabase Storage, not by our schema. RLS
 *    is enabled by Supabase on project creation as a system-level default;
 *    our migrations only add policies to it. Adding
 *    `alter table storage.objects enable row level security` from our
 *    migrations would either fail (permission denied to alter a Supabase-
 *    managed table) or double-enable an already-enabled state.
 *
 *  - `residents`: seeded via direct SQL through Supabase MCP
 *    `apply_migration` during Task #43 (Residents/Owners: DB-Migration).
 *    The table was NOT written into `supabase/migrations/`; its
 *    `create table` + `enable row level security` live only in the remote
 *    Supabase migration history. Same reasoning applies to `owners`
 *    (which is FK-referenced from `20260803001300_billing.sql` but never
 *    created in a local migration either) — but `owners` has no policies
 *    in any local migration file, so it doesn't show up as a policy-table
 *    here at all. The `residents` entry is only needed because the
 *    resident-portal migration (`20260803001500_resident_portal.sql`)
 *    adds a SELECT policy for the portal role. See the same-shaped
 *    allowlist in `migration-table-existence.test.ts`.
 *
 * The test asserts entries stay stale-relevant: if either entry ever
 * gains a proper local ENABLE-statement, the allowlist entry becomes an
 * error and forces removal. If either loses all its local policies, the
 * entry also becomes dead weight and forces removal.
 */
const INTENTIONALLY_EXTERNAL_RLS_TABLES = new Set<string>([
  'storage.objects',
  'residents',
]);

describe('RLS enable-statement coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many policies', () => {
      expect(ALL_POLICIES.length).toBeGreaterThan(100);
    });
    it('scanner discovered many enable-rls statements', () => {
      expect(ALL_ENABLES.length).toBeGreaterThan(30);
    });
  });

  describe('every table with a policy also has enable-rls in some migration', () => {
    for (const [table, policyFiles] of [...POLICIES_BY_TABLE].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      it(`${table} (${policyFiles.length} policies, first in ${policyFiles[0]}) has an enable-rls in some migration OR is on the external-RLS allowlist`, () => {
        const enableFiles = ENABLES_BY_TABLE.get(table);
        if (INTENTIONALLY_EXTERNAL_RLS_TABLES.has(table)) {
          expect(
            enableFiles,
            `${table} is in INTENTIONALLY_EXTERNAL_RLS_TABLES but now has a local "alter table ... enable row level security" statement in ${enableFiles?.[0] ?? '?'}. Remove the allowlist entry so this table is guarded like any other RLS-scoped table.`,
          ).toBeUndefined();
          return;
        }
        expect(
          enableFiles,
          `Table ${table} has ${policyFiles.length} policy statement(s) in migrations (first: ${policyFiles[0]}) but no "alter table ${table} enable row level security" anywhere in supabase/migrations/. Without ENABLE, every policy on this table is inert — Postgres silently ignores them and RLS is fail-open. That is the fastest-to-miss RLS bug: the "create policy" statement runs fine, no error, no warning, but reads and writes bypass every predicate. Fix: add "alter table ${table} enable row level security;" to the migration that first creates the table (or to a fresh migration if the table already exists in prod without ENABLE). If RLS is genuinely enabled out-of-band (e.g. Supabase-owned schemas like storage.objects, or tables seeded via Supabase MCP apply_migration outside supabase/migrations/), add "${table}" to INTENTIONALLY_EXTERNAL_RLS_TABLES with a written rationale explaining WHERE the enable actually lives.`,
        ).toBeDefined();
      });
    }
  });

  describe('external-RLS allowlist entries still have local policies', () => {
    for (const table of INTENTIONALLY_EXTERNAL_RLS_TABLES) {
      it(`allowlist entry "${table}" still has at least one policy in supabase/migrations/`, () => {
        const policyFiles = POLICIES_BY_TABLE.get(table);
        expect(
          policyFiles && policyFiles.length > 0,
          `INTENTIONALLY_EXTERNAL_RLS_TABLES contains "${table}" but no local migration creates any policy on it anymore. The allowlist entry was only needed because policies existed on a table whose ENABLE lived elsewhere — with no policies left, the entry is dead weight. Delete the allowlist entry.`,
        ).toBe(true);
      });
    }
  });
});
