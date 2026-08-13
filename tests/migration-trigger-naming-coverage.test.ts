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

interface Trigger {
  file: string;
  name: string;
  table: string;
  shortTable: string;
  timing: 'before' | 'after' | 'instead-of' | null;
  events: string[];
  execFn: string | null;
  indexInFile: number;
}

/**
 * Grep-style trigger extraction. Grabs `create [or replace] trigger
 * <name>` and everything up to the terminating semicolon, then
 * pulls the identifying pieces (timing, events, target table,
 * executed function).
 */
function collectTriggers(): Trigger[] {
  const out: Trigger[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    const re =
      /create\s+(?:or\s+replace\s+)?trigger\s+([a-z_][a-z0-9_]*)\s+([\s\S]*?);/gi;
    let m: RegExpExecArray | null;
    let indexInFile = 0;
    while ((m = re.exec(sql)) !== null) {
      const name = m[1]!.toLowerCase();
      const body = m[2]!;
      const timingMatch = body.match(/\b(before|after|instead\s+of)\b/i);
      const timing: Trigger['timing'] = timingMatch
        ? (timingMatch[1]!.toLowerCase().replace(/\s+/g, '-') as Trigger['timing'])
        : null;
      const events = Array.from(
        body.matchAll(/\b(insert|update|delete|truncate)\b/gi),
      ).map((mm) => mm[1]!.toLowerCase());
      const onTable = body.match(/\bon\s+([a-z_][a-z0-9_.]*)/i);
      const execFn = body.match(
        /\bexecute\s+(?:function|procedure)\s+([a-z_][a-z0-9_.]*)/i,
      );
      const table = onTable ? onTable[1]!.toLowerCase() : '?';
      const shortTable = table.replace(/^[a-z_]+\./, '');
      out.push({
        file,
        name,
        table,
        shortTable,
        timing,
        events,
        execFn: execFn ? execFn[1]!.toLowerCase() : null,
        indexInFile: indexInFile++,
      });
    }
  }
  return out;
}

const TRIGGERS = collectTriggers();
const PG_MAX_IDENT = 63;

/**
 * Grandfathered exceptions to the `<shortTable>_<verb>` convention.
 *
 * Key format: `<file>::<name>` — file-scoped so a rename in a
 * later migration would need its own entry (surfacing the change).
 */
const NAME_PREFIX_EXCEPTIONS = new Set<string>([
  // Supabase idiom: triggers on `auth.users` use an `on_` prefix
  // (matches Supabase's own template/docs style). The trigger sits
  // in the auth schema which is outside our normal `public.*`
  // convention, so we grandfather it explicitly.
  '20260801000000_init.sql::on_auth_user_created',
  // `platform.invoices` shares its short name with `public.invoices`
  // (public.invoices = agency-to-customer, platform.invoices =
  // operator-to-tenant). The bare `<shortTable>_<verb>` convention
  // would produce `invoices_set_updated_at` on BOTH tables and
  // collide the codebase-wide uniqueness check below. The trigger
  // therefore carries the `platform_invoices_*` prefix (same
  // rationale as the platform_invoices_* indexes grandfathered in
  // migration-index-naming-coverage). Fixup-migration
  // `20260813140000_platform_trigger_rename.sql` renames the same
  // trigger on already-deployed DBs via ALTER TRIGGER (not CREATE),
  // so it is invisible to this scanner and needs no separate entry.
  '20260812081218_platform_layer_and_subscriptions.sql::platform_invoices_set_updated_at',
]);

describe('Migration trigger naming coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many triggers (>= 40)', () => {
      expect(TRIGGERS.length).toBeGreaterThanOrEqual(40);
    });

    it('every trigger name matches Postgres identifier rules', () => {
      const bad = TRIGGERS.filter((t) => !/^[a-z_][a-z0-9_]*$/.test(t.name));
      expect(
        bad,
        bad.length > 0
          ? `Trigger names that don't match /^[a-z_][a-z0-9_]*$/: ${bad
              .map((t) => `${t.file}::${t.name}`)
              .join(', ')}`
          : 'unexpected — bad names reported but list empty',
      ).toEqual([]);
    });

    it('every trigger name fits within the 63-char Postgres identifier limit', () => {
      const oversized = TRIGGERS.filter((t) => t.name.length > PG_MAX_IDENT);
      expect(
        oversized,
        oversized.length > 0
          ? `Trigger names > 63 chars (Postgres will TRUNCATE silently): ${oversized
              .map((t) => `${t.file}::${t.name} (${t.name.length} chars)`)
              .join(', ')}`
          : 'unexpected — oversized reported but list empty',
      ).toEqual([]);
    });

    it('every trigger has an extractable timing (before/after/instead-of)', () => {
      const noTiming = TRIGGERS.filter((t) => t.timing === null);
      expect(
        noTiming,
        noTiming.length > 0
          ? `Triggers with no extractable timing (extractor bug or malformed SQL): ${noTiming
              .map((t) => `${t.file}::${t.name}`)
              .join(', ')}`
          : 'unexpected — noTiming reported but list empty',
      ).toEqual([]);
    });

    it('every trigger has an extractable target table (`on <table>`)', () => {
      const noTable = TRIGGERS.filter((t) => t.table === '?');
      expect(
        noTable,
        noTable.length > 0
          ? `Triggers with no extractable target table: ${noTable
              .map((t) => `${t.file}::${t.name}`)
              .join(', ')}`
          : 'unexpected — noTable reported but list empty',
      ).toEqual([]);
    });
  });

  /**
   * Rule: every trigger name starts with its target table's
   * unqualified name followed by an underscore, then a descriptive
   * verb (`<shortTable>_<verb>`).
   *
   * Why this matters:
   *
   *   - `\dS <table>` in psql lists triggers alphabetically. The
   *     table-prefix keeps every trigger for a given table sorted
   *     together, so an on-call engineer scanning a table's
   *     triggers sees a coherent group instead of a scattered list.
   *   - Postgres emits the trigger name in error messages, cascade
   *     tracebacks, and `pg_stat_user_functions`. A prefix-free
   *     name like `audit` in a log message forces the reader to
   *     cross-reference `information_schema.triggers` to figure
   *     out which table it belongs to.
   *   - When a table is renamed, greppable trigger names surface
   *     the mismatch immediately (the trigger now belongs to a
   *     table whose name it doesn't share). Without the convention
   *     the drift is silent.
   *   - Prevents accidental cross-table name collisions. Postgres
   *     scopes trigger names to tables, so nothing STOPS you from
   *     naming two triggers `audit` on different tables — but the
   *     resulting logs are ambiguous. The prefix convention makes
   *     the codebase-wide uniqueness rule below trivially true.
   */
  describe('every trigger name starts with its target table\'s short name', () => {
    for (const t of TRIGGERS.slice().sort((a, b) =>
      `${a.file}::${a.name}`.localeCompare(`${b.file}::${b.name}`),
    )) {
      const key = `${t.file}::${t.name}`;
      const grandfathered = NAME_PREFIX_EXCEPTIONS.has(key);
      const expectedPrefix = `${t.shortTable}_`;
      const followsConvention = t.name.startsWith(expectedPrefix);
      it(`${t.name} on ${t.table} (in ${t.file}) ${grandfathered ? 'is grandfathered' : 'follows <shortTable>_<verb>'}`, () => {
        if (grandfathered) {
          // If the grandfathered trigger now DOES follow the
          // convention, remove the exception. Bidirectional stale
          // check.
          expect(
            followsConvention,
            followsConvention
              ? `Grandfathered exception ${key} now follows the convention — remove the entry from NAME_PREFIX_EXCEPTIONS.`
              : 'expected grandfathered trigger to remain a naming exception',
          ).toBe(false);
          return;
        }
        expect(
          followsConvention,
          !followsConvention
            ? `Trigger "${t.name}" on ${t.table} (${t.file}) does not start with "${expectedPrefix}". Rename it to \`${expectedPrefix}<verb>\` (e.g. \`${expectedPrefix}audit\`, \`${expectedPrefix}set_updated_at\`, \`${expectedPrefix}generate_code\`). The prefix keeps triggers grouped in psql \\dS output, disambiguates log messages, and surfaces stale names when the table is later renamed.`
            : 'unexpected — follows convention but assertion fired',
        ).toBe(true);
      });
    }
  });

  /**
   * Rule: every trigger name is unique across all migrations.
   *
   * Postgres allows two tables to share a trigger name because
   * triggers are scoped to tables, but codebase-wide uniqueness:
   *
   *   - keeps `git grep <trigger_name>` a targeted lookup instead
   *     of a disambiguation exercise,
   *   - makes log-line inspection unambiguous — a support
   *     engineer sees `trigger fired: work_orders_log_change`
   *     and can jump straight to the source, no
   *     "which one is that?" step.
   *
   * The table-prefix convention above already makes this trivially
   * true. This test guards against someone shipping a trigger like
   * `audit` on a new table (both violating the prefix convention
   * and colliding with `tenants_audit`'s short name in log-search
   * queries).
   */
  describe('aggregate: name uniqueness', () => {
    it('every trigger name is unique across the codebase', () => {
      const seen = new Map<string, string[]>();
      for (const t of TRIGGERS) {
        const key = t.name;
        if (!seen.has(key)) seen.set(key, []);
        seen.get(key)!.push(`${t.file}::${t.table}`);
      }
      const duplicates = [...seen.entries()].filter(([, sites]) => sites.length > 1);
      expect(
        duplicates,
        duplicates.length > 0
          ? `Trigger names appearing more than once: ${duplicates
              .map(([name, sites]) => `"${name}" at [${sites.join(', ')}]`)
              .join(' | ')}`
          : 'unexpected — duplicates reported but list empty',
      ).toEqual([]);
    });
  });

  /**
   * Bidirectional stale-check for the grandfathering allowlist:
   * if an entry references a trigger name that no longer exists,
   * the exemption is dead code and should be removed.
   */
  describe('grandfathering allowlist hygiene', () => {
    it('every NAME_PREFIX_EXCEPTIONS entry still refers to an existing trigger', () => {
      const existing = new Set(TRIGGERS.map((t) => `${t.file}::${t.name}`));
      const orphans = [...NAME_PREFIX_EXCEPTIONS].filter((key) => !existing.has(key));
      expect(
        orphans,
        orphans.length > 0
          ? `NAME_PREFIX_EXCEPTIONS entries pointing at a trigger that no longer exists (renamed or dropped): ${orphans.join(', ')}. Remove these entries from the set.`
          : 'unexpected — orphans reported but list empty',
      ).toEqual([]);
    });
  });
});
