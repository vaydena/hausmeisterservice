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

interface FileSource {
  file: string;
  sql: string;
}

const ALL_FILES: FileSource[] = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((file) => ({
    file,
    sql: stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8')),
  }));

/**
 * Patterns that are NEVER acceptable in a migration, period — no allowlist,
 * no exceptions. Each one is either an irreversible data-loss primitive, a
 * transaction-breaking DDL that leaves the database half-migrated, a
 * server-wide config change that should never happen in a per-project
 * migration, or a session-role escalation that would leave subsequent
 * statements running as the wrong role.
 *
 *  - `truncate`: irreversible per-row delete, faster than `DELETE FROM`.
 *    Copy-pasted from a local-dev reset script it silently empties the
 *    table in production on migration apply. Legitimate data cleanup
 *    belongs in a targeted `delete from ... where ...` with a filter that
 *    demonstrably scopes what's removed.
 *  - `create [unique] index concurrently` / `drop index concurrently`:
 *    Supabase's migration runner (like most tools built on `psql`) wraps
 *    each file in a single transaction. `CONCURRENTLY` variants are only
 *    valid OUTSIDE a transaction — Postgres raises `25001` and aborts
 *    the migration halfway, potentially leaving the schema half-applied.
 *    If concurrent index creation is truly needed (rare — most tables
 *    are small enough that a locking `CREATE INDEX` is fine), do it as
 *    a manual out-of-band operation, not a migration.
 *  - `drop database`, `drop schema`, `drop role`, `drop user`,
 *    `drop owned`: catastrophic scope. `drop schema public cascade`
 *    would delete every table in the app. `drop owned` deletes every
 *    object owned by a role, cross-schema.
 *  - `alter system`: modifies the cluster's postgresql.conf equivalent,
 *    persists across restarts, requires superuser. Supabase migrations
 *    run as an application role, so this would fail — but if it
 *    somehow didn't, the change would apply cluster-wide, not just to
 *    this project.
 *  - `reset role` / `set role`: session-role manipulation. Migrations
 *    should run as their intended role top-to-bottom; a mid-file `SET
 *    ROLE` leaves every subsequent statement running as a different
 *    role, silently. If you need to grant privileges to a role, use
 *    `GRANT ... TO role` — don't switch into it.
 *  - `copy ... from program`: executes an arbitrary shell command on
 *    the database host and pipes its stdout into a table. Even in a
 *    controlled Supabase environment this is a shell-injection
 *    surface via the migration file itself; forbid categorically.
 */
const PROHIBITED_PATTERNS: Array<{ name: string; pattern: RegExp; rationale: string }> = [
  {
    name: 'truncate',
    pattern: /\btruncate\b/i,
    rationale: 'irreversible per-row delete; a copy-paste from a local reset script silently empties the table in production on apply',
  },
  {
    name: 'create index concurrently',
    pattern: /\bcreate\s+index\s+concurrently\b/i,
    rationale: 'CONCURRENTLY is only valid outside a transaction; the migration runner wraps each file in one, so Postgres raises 25001 and aborts halfway',
  },
  {
    name: 'create unique index concurrently',
    pattern: /\bcreate\s+unique\s+index\s+concurrently\b/i,
    rationale: 'same as create index concurrently — 25001 in transactional migration context',
  },
  {
    name: 'drop index concurrently',
    pattern: /\bdrop\s+index\s+concurrently\b/i,
    rationale: 'same as create index concurrently — 25001 in transactional migration context',
  },
  {
    name: 'drop database',
    pattern: /\bdrop\s+database\b/i,
    rationale: 'catastrophic scope; a migration must never touch the database catalog at cluster level',
  },
  {
    name: 'drop schema',
    pattern: /\bdrop\s+schema\b/i,
    rationale: 'catastrophic scope; `drop schema public cascade` would delete every table in the app',
  },
  {
    name: 'drop role',
    pattern: /\bdrop\s+role\b/i,
    rationale: 'role management is a cluster-level operation, not a project migration concern',
  },
  {
    name: 'drop user',
    pattern: /\bdrop\s+user\b/i,
    rationale: 'role management is a cluster-level operation, not a project migration concern',
  },
  {
    name: 'drop owned',
    pattern: /\bdrop\s+owned\b/i,
    rationale: 'deletes every object owned by a role, cross-schema; wildly out of scope for a migration',
  },
  {
    name: 'alter system',
    pattern: /\balter\s+system\b/i,
    rationale: 'modifies the cluster-wide postgresql.conf equivalent; requires superuser and would apply cluster-wide, not to this project',
  },
  {
    name: 'reset role',
    pattern: /\breset\s+role\b/i,
    rationale: 'session-role manipulation; every subsequent statement then runs as a different role, silently',
  },
  {
    name: 'set role',
    pattern: /\bset\s+role\b/i,
    rationale: 'session-role manipulation; use `GRANT ... TO role` if you need to give a role privileges instead of switching into it',
  },
  {
    name: 'copy ... from program',
    pattern: /\bcopy\b[\s\S]{0,100}\bfrom\s+program\b/i,
    rationale: 'executes an arbitrary shell command on the database host; forbid categorically as a shell-injection surface via the migration file itself',
  },
];

/**
 * Patterns that MUST use `IF EXISTS` when dropping an object. The reason
 * is idempotent re-apply: if a migration is ever re-run against a
 * partially-migrated database (recovery scenario, dev-DB re-seed, staging
 * refresh) the naked `DROP` variant raises an error and aborts the file
 * halfway. `DROP ... IF EXISTS` is a no-op when the object doesn't exist
 * and does the drop otherwise — same intent, safe under re-run.
 *
 * Unlike PROHIBITED_PATTERNS above, we DO keep a small allowlist here:
 * a handful of legacy migrations use the naked variant. Each allowlist
 * entry is a `<file>::<verbatim-line>` pair so any behavioral change to
 * the line invalidates the entry.
 */
const NAKED_DROP_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'drop table (no IF EXISTS)', pattern: /\bdrop\s+table\s+(?!if\s+exists)/i },
  { name: 'drop function (no IF EXISTS)', pattern: /\bdrop\s+function\s+(?!if\s+exists)/i },
  { name: 'drop trigger (no IF EXISTS)', pattern: /\bdrop\s+trigger\s+(?!if\s+exists)/i },
  { name: 'drop policy (no IF EXISTS)', pattern: /\bdrop\s+policy\s+(?!if\s+exists)/i },
  { name: 'drop view (no IF EXISTS)', pattern: /\bdrop\s+view\s+(?!if\s+exists)/i },
  { name: 'drop type (no IF EXISTS)', pattern: /\bdrop\s+type\s+(?!if\s+exists)/i },
];

/**
 * Legacy naked drops. Each entry has the form
 *   `<file>::<one-line, whitespace-collapsed statement>`
 *
 * so any edit to the line invalidates the allowlist entry (the test's
 * stale-check will then flag it and force reconsideration).
 *
 *  - `20260803000300_notifications_perf_polish.sql::drop policy
 *    "notifications_(select|update|delete)_own" on public.notifications;`
 *    This migration is a targeted RLS-optimization rewrite of the three
 *    `notifications_*_own` policies from the initial schema. The three
 *    naked drops precede three fresh `create policy` statements later
 *    in the same file. It should have used `if exists` for re-apply
 *    safety; grandfathered as-is because rewriting the file after it's
 *    been applied to production risks a checksum mismatch in
 *    supabase's migration ledger. Any FUTURE `drop policy` in this
 *    migration or elsewhere must use `if exists`.
 */
const NAKED_DROP_ALLOWLIST = new Set<string>([
  '20260803000300_notifications_perf_polish.sql::drop policy "notifications_select_own" on public.notifications;',
  '20260803000300_notifications_perf_polish.sql::drop policy "notifications_update_own" on public.notifications;',
  '20260803000300_notifications_perf_polish.sql::drop policy "notifications_delete_own" on public.notifications;',
]);

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

interface NakedDropHit {
  file: string;
  patternName: string;
  line: string;
  key: string;
}

function findAllNakedDrops(): NakedDropHit[] {
  const hits: NakedDropHit[] = [];
  for (const { file, sql } of ALL_FILES) {
    const lines = sql.split('\n');
    for (const rawLine of lines) {
      for (const p of NAKED_DROP_PATTERNS) {
        if (p.pattern.test(rawLine)) {
          const line = collapseWhitespace(rawLine);
          hits.push({ file, patternName: p.name, line, key: `${file}::${line}` });
        }
      }
    }
  }
  return hits;
}

describe('Migration destructive-statement coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many migration files', () => {
      expect(ALL_FILES.length).toBeGreaterThan(20);
    });
    it('prohibited-pattern registry is non-empty', () => {
      expect(PROHIBITED_PATTERNS.length).toBeGreaterThan(0);
    });
    it('naked-drop pattern registry is non-empty', () => {
      expect(NAKED_DROP_PATTERNS.length).toBeGreaterThan(0);
    });
  });

  describe('no migration contains a prohibited pattern', () => {
    for (const p of PROHIBITED_PATTERNS) {
      it(`no migration uses \`${p.name}\``, () => {
        const hits = ALL_FILES.filter((f) => p.pattern.test(f.sql)).map((f) => f.file);
        expect(
          hits,
          hits.length > 0
            ? `The following migrations contain the prohibited pattern \`${p.name}\`:\n${hits
                .map((f) => `  ${f}`)
                .join(
                  '\n',
                )}\n\nReason it's prohibited: ${p.rationale}\n\nThere is no allowlist for this pattern. If you believe you have a legitimate need, the answer is almost certainly to accomplish the same goal differently:\n  - \`truncate\` → \`delete from t where <explicit filter>\`\n  - \`create index concurrently\` → drop the CONCURRENTLY, accept the brief lock during migration OR run the CREATE INDEX manually out-of-band, not as a migration\n  - \`drop schema/database/role/user/owned\` → do not do this in a migration; it belongs in an incident-response runbook\n  - \`alter system\` → set the parameter via Supabase project settings, not SQL\n  - \`set role\` / \`reset role\` → grant privileges to a role instead of switching into it\n  - \`copy from program\` → load the data via a server-side script that reads a file you control, not via the DB engine`
            : `unexpected — hits reported but list is empty`,
        ).toEqual([]);
      });
    }
  });

  describe('every naked-drop occurrence is on the allowlist', () => {
    it('the set of naked drops in migrations exactly matches NAKED_DROP_ALLOWLIST', () => {
      const hits = findAllNakedDrops();
      const actualKeys = new Set(hits.map((h) => h.key));
      const missing = [...actualKeys].filter((k) => !NAKED_DROP_ALLOWLIST.has(k));
      const stale = [...NAKED_DROP_ALLOWLIST].filter((k) => !actualKeys.has(k));
      expect(
        { missing, stale },
        [
          missing.length > 0
            ? `\nThese naked \`DROP\` statements (missing \`IF EXISTS\`) are present in supabase/migrations/ but NOT on the allowlist:\n${missing
                .map((k) => `  ${k}`)
                .join(
                  '\n',
                )}\n\nA naked \`DROP TABLE/FUNCTION/TRIGGER/POLICY/VIEW/TYPE\` raises an error when the object does not exist. Migrations occasionally need to be re-applied against partially-migrated databases (recovery, dev re-seed, staging refresh); the naked variant aborts the file halfway on the second run. Fix: add \`IF EXISTS\` between \`DROP\` and the object name. Only add an entry to NAKED_DROP_ALLOWLIST if the migration has already been applied to production and rewriting it would cause a supabase migration-ledger checksum mismatch — and even then, prefer to add a NEW migration that does the drop-and-recreate correctly and revert the naked drop by leaving the object as-is.`
            : '',
          stale.length > 0
            ? `\nThese NAKED_DROP_ALLOWLIST entries no longer match any naked drop in supabase/migrations/:\n${stale
                .map((k) => `  ${k}`)
                .join(
                  '\n',
                )}\n\nEither the migration file was edited to add \`IF EXISTS\` (great — delete the allowlist entry) or the file/line was renamed/moved. Allowlist entries that don't match reality are dead weight.`
            : '',
        ]
          .join('')
          .trim() || 'unexpected — sets diverged but no differences reported',
      ).toEqual({ missing: [], stale: [] });
    });
  });

  describe('every NAKED_DROP_ALLOWLIST entry still exists and is still a naked drop', () => {
    for (const key of NAKED_DROP_ALLOWLIST) {
      it(`allowlist entry "${key}" still matches a naked drop in migrations`, () => {
        const [file] = key.split('::');
        expect(
          ALL_FILES.some((f) => f.file === file),
          `NAKED_DROP_ALLOWLIST contains "${key}" but migration file "${file}" no longer exists. Delete the allowlist entry.`,
        ).toBe(true);
        const hits = findAllNakedDrops();
        expect(
          hits.some((h) => h.key === key),
          `NAKED_DROP_ALLOWLIST contains "${key}" but no matching naked-drop line exists in that file anymore. Either the line was edited (add \`IF EXISTS\` — great, delete the allowlist entry) or the file was rewritten. Delete or update the entry.`,
        ).toBe(true);
      });
    }
  });
});
