import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/**
 * Load all migrations sorted by filename. Supabase migration filenames start
 * with a timestamp, so lexicographic order equals execution order — the last
 * enable/disable statement per table wins, just like in the DB.
 */
function loadMigrations(): Array<{ file: string; sql: string }> {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ file: f, sql: readFileSync(join(MIGRATIONS_DIR, f), 'utf8') }));
}

/** Strip -- line comments and /* … *​/ block comments so regex only hits real SQL. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

const MIGRATIONS = loadMigrations().map(({ file, sql }) => ({
  file,
  sql: stripSqlComments(sql),
}));

const CREATE_TABLE_RE =
  /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_.]*)\s*\(/gi;

const RLS_TOGGLE_RE =
  /\balter\s+table\s+(?:if\s+exists\s+)?([a-z_][a-z0-9_.]*)\s+(enable|disable)\s+row\s+level\s+security\b/gi;

/**
 * Return the table name if the qualified identifier refers to something in
 * `public` (either explicitly `public.foo` or bare `foo`, which Postgres
 * resolves to `public` given the default `search_path`). Return `null` for
 * tables in Supabase-managed schemas (`auth.*`, `storage.*`, …) which have
 * their own security model.
 */
function publicTableName(qualified: string): string | null {
  const parts = qualified.toLowerCase().split('.');
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2 && parts[0] === 'public') return parts[1]!;
  return null;
}

interface RlsStatement {
  name: string;
  action: 'enable' | 'disable';
  file: string;
}

const CREATED = new Map<string, string>();
const RLS_STATEMENTS: RlsStatement[] = [];

for (const { file, sql } of MIGRATIONS) {
  for (const m of sql.matchAll(CREATE_TABLE_RE)) {
    const name = publicTableName(m[1]!);
    if (!name) continue;
    if (!CREATED.has(name)) CREATED.set(name, file);
  }
  for (const m of sql.matchAll(RLS_TOGGLE_RE)) {
    const name = publicTableName(m[1]!);
    if (!name) continue;
    RLS_STATEMENTS.push({
      name,
      action: m[2]!.toLowerCase() as 'enable' | 'disable',
      file,
    });
  }
}

function finalRlsStateFor(table: string): 'enabled' | 'disabled' | 'never-set' {
  const relevant = RLS_STATEMENTS.filter((r) => r.name === table).sort((a, b) =>
    a.file.localeCompare(b.file),
  );
  if (relevant.length === 0) return 'never-set';
  return relevant[relevant.length - 1]!.action === 'enable' ? 'enabled' : 'disabled';
}

describe('RLS coverage on public schema', () => {
  describe('sanity: extractors found something', () => {
    it('scanner discovered at least one migration file', () => {
      expect(MIGRATIONS.length).toBeGreaterThan(0);
    });
    it('scanner discovered CREATE TABLE statements', () => {
      expect(CREATED.size).toBeGreaterThan(0);
    });
    it('scanner discovered ENABLE ROW LEVEL SECURITY statements', () => {
      expect(RLS_STATEMENTS.filter((r) => r.action === 'enable').length).toBeGreaterThan(0);
    });
  });

  describe('every declared table ends with RLS enabled', () => {
    for (const [name, firstFile] of [...CREATED.entries()].sort()) {
      it(`table "public.${name}" (first declared in ${firstFile}) has RLS enabled`, () => {
        const state = finalRlsStateFor(name);
        expect(
          state,
          state === 'never-set'
            ? `public.${name} was created in ${firstFile} but no migration ever runs "alter table ${name} enable row level security". This is a cross-tenant data-leak risk — add the ENABLE statement in the SAME migration as the create.`
            : `public.${name} was explicitly DISABLED by a later migration. This is almost certainly a bug — cross-tenant data-leak risk.`,
        ).toBe('enabled');
      });
    }
  });

  describe('no migration disables RLS', () => {
    it('migration history contains no "alter table … disable row level security" statement', () => {
      const disables = RLS_STATEMENTS.filter((r) => r.action === 'disable');
      const lines = disables.map(
        (r) => `  ${r.file}: alter table ${r.name} disable row level security`,
      );
      expect(
        disables,
        `Found DISABLE-RLS statement(s):\n${lines.join('\n')}\nRLS must remain enabled on every public.* table.`,
      ).toEqual([]);
    });
  });
});
