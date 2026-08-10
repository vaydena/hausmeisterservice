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

interface Index {
  file: string;
  name: string;
  table: string;
  shortTable: string;
  unique: boolean;
  method: string;
  cols: string;
  hasWhere: boolean;
  indexInFile: number;
}

/**
 * Extract every `create [unique] index ... on <table> (...)` from the
 * migration files. Unique indexes are collected too — they're already
 * name-checked by the UNIQUE-constraint guard (Batch 34), but they
 * still participate in the naming-convention (`_idx` suffix,
 * `<shortTable>_` prefix, codebase-wide uniqueness).
 */
function collectIndexes(): Index[] {
  const out: Index[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    let indexInFile = 0;
    const re =
      /create\s+(unique\s+)?index(?:\s+concurrently)?(?:\s+if\s+not\s+exists)?\s+([a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_.]*)(?:\s+using\s+([a-z_][a-z0-9_]*))?\s*\(([^)]*)\)\s*(where\s+[^;]*)?/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const name = m[2]!.toLowerCase();
      const table = m[3]!.toLowerCase();
      const shortTable = table.replace(/^[a-z_]+\./, '');
      out.push({
        file,
        name,
        table,
        shortTable,
        unique: !!m[1],
        method: m[4] ? m[4].toLowerCase() : 'btree',
        cols: m[5]!.trim().replace(/\s+/g, ' '),
        hasWhere: !!m[6],
        indexInFile: indexInFile++,
      });
    }
  }
  return out;
}

const INDEXES = collectIndexes();
const PG_MAX_IDENT = 63;

/**
 * Grandfathered exceptions to the strict
 * `<shortTable>_<cols>_idx` naming convention.
 *
 * Key format: `<file>::<name>`. File-scoped means renaming or
 * removing the index in a later migration will invalidate the
 * entry (surfacing the change via the orphan check below).
 *
 * Each exception here uses a documented, table-consistent
 * abbreviated prefix (e.g. `time_corr_*` for the
 * `time_entry_corrections` table, `billing_line_*` for
 * `billing_line_items`). Renaming these already-applied indexes
 * would require additional migrations without semantic value,
 * so we grandfather them explicitly and require any NEW indexes
 * on these tables to use the full prefix OR earn their own entry.
 */
const NAMING_EXCEPTIONS = new Set<string>([
  // `time_entry_corrections` uses the `time_corr_*` short prefix
  '20260803000500_time_corrections.sql::time_corr_tenant_status_idx',
  '20260803000500_time_corrections.sql::time_corr_entry_idx',
  '20260803000500_time_corrections.sql::time_corr_requester_idx',
  '20260803000500_time_corrections.sql::time_corr_decided_by_idx',
  '20260803000501_time_corrections_fk_indexes.sql::time_corr_entry_user_idx',
  '20260803000501_time_corrections_fk_indexes.sql::time_corr_proposed_property_idx',
  '20260803000501_time_corrections_fk_indexes.sql::time_corr_proposed_work_order_idx',
  // `billing_line_items` uses the `billing_line_*` short prefix
  '20260803001300_billing.sql::billing_line_offer_idx',
  '20260803001300_billing.sql::billing_line_invoice_idx',
]);

describe('Migration index naming coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many indexes (>= 150)', () => {
      expect(INDEXES.length).toBeGreaterThanOrEqual(150);
    });

    it('every index name matches Postgres identifier rules', () => {
      const bad = INDEXES.filter((idx) => !/^[a-z_][a-z0-9_]*$/.test(idx.name));
      expect(
        bad,
        bad.length > 0
          ? `Index names that don't match /^[a-z_][a-z0-9_]*$/: ${bad
              .map((i) => `${i.file}::${i.name}`)
              .join(', ')}`
          : 'unexpected — bad names reported but list empty',
      ).toEqual([]);
    });

    it('every index name fits within the 63-char Postgres identifier limit', () => {
      const oversized = INDEXES.filter((idx) => idx.name.length > PG_MAX_IDENT);
      expect(
        oversized,
        oversized.length > 0
          ? `Index names > 63 chars (Postgres will TRUNCATE silently, risking collision): ${oversized
              .map((i) => `${i.file}::${i.name} (${i.name.length} chars)`)
              .join(', ')}`
          : 'unexpected — oversized reported but list empty',
      ).toEqual([]);
    });

    it('every index has an extractable target table (`on <table>`)', () => {
      const noTable = INDEXES.filter((idx) => !idx.table);
      expect(noTable, `Indexes without extractable target table: ${noTable.length}`).toEqual([]);
    });

    it('every index has extractable column expressions', () => {
      const noCols = INDEXES.filter((idx) => !idx.cols);
      expect(noCols, `Indexes without extractable columns: ${noCols.length}`).toEqual([]);
    });
  });

  /**
   * Convention: every index name follows `<shortTable>_<cols>_idx`.
   *
   * Why this matters:
   *
   *   - `\di+ *<table>*` in psql filters indexes by name-substring.
   *     A table-prefix makes the filter deterministic; a
   *     prefix-free name like `status_idx` on `keys` hides itself
   *     from any table-scoped inspection.
   *   - The `_idx` suffix disambiguates from constraint names in
   *     `pg_indexes` / `information_schema` output. Postgres
   *     auto-names UNIQUE constraint indexes as `<table>_<col>_key`
   *     and PK indexes as `<table>_pkey` — indexes we CREATE
   *     manually get the `_idx` suffix to stand apart, so a scan
   *     for "explicit tuning indexes" is grep-able.
   *   - When a table is dropped, Postgres cascades the indexes
   *     with it. But when a column is dropped, matching
   *     `<shortTable>_<removed_col>_idx` in the migration diff
   *     surfaces every index that needs re-thinking — the
   *     convention keeps the codebase self-auditable.
   *   - Codebase-wide index-name uniqueness (enforced by Postgres
   *     within a schema, and further tested below) becomes
   *     trivially true when every name carries its table prefix.
   *
   * Nine indexes are grandfathered (see NAMING_EXCEPTIONS): all use
   * a documented shortened prefix (`time_corr_*`, `billing_line_*`)
   * consistent within their table. New indexes on those tables must
   * still earn an exception entry AND explain why the full prefix
   * is impractical.
   */
  describe('every index name starts with its target table\'s short name and ends with _idx', () => {
    for (const idx of INDEXES.slice().sort((a, b) =>
      `${a.file}::${a.name}`.localeCompare(`${b.file}::${b.name}`),
    )) {
      const key = `${idx.file}::${idx.name}`;
      const grandfathered = NAMING_EXCEPTIONS.has(key);
      const expectedPrefix = `${idx.shortTable}_`;
      const startsWithTable = idx.name.startsWith(expectedPrefix);
      const endsWithIdx = idx.name.endsWith('_idx');
      const followsConvention = startsWithTable && endsWithIdx;
      it(`${idx.name} on ${idx.table} (in ${idx.file}) ${grandfathered ? 'is grandfathered' : 'follows <shortTable>_<cols>_idx'}`, () => {
        if (grandfathered) {
          expect(
            followsConvention,
            followsConvention
              ? `Grandfathered exception ${key} now follows the convention — remove the entry from NAMING_EXCEPTIONS.`
              : 'expected grandfathered index to remain a naming exception',
          ).toBe(false);
          return;
        }
        const missing: string[] = [];
        if (!startsWithTable) missing.push(`missing table prefix "${expectedPrefix}"`);
        if (!endsWithIdx) missing.push('missing "_idx" suffix');
        expect(
          followsConvention,
          !followsConvention
            ? `Index "${idx.name}" on ${idx.table} (${idx.file}) does not follow the naming convention: ${missing.join(', ')}. Rename it to \`${expectedPrefix}<column_suffix>_idx\` (e.g. \`${expectedPrefix}tenant_id_idx\` for a single-column FK-index, \`${expectedPrefix}tenant_status_idx\` for a composite). The table-prefix keeps indexes greppable and psql-listable by table; the \`_idx\` suffix distinguishes explicit tuning indexes from constraint-generated ones (\`_key\`, \`_pkey\`, \`_fkey\`).`
            : 'unexpected — follows convention but assertion fired',
        ).toBe(true);
      });
    }
  });

  /**
   * Rule: every index name is unique across the codebase.
   *
   * Postgres enforces uniqueness within a schema, so this is
   * partially a redundancy — but our migrations sometimes target
   * `public.` and sometimes unqualified names in the same
   * schema, and the migration ledger is apply-order sensitive.
   * A codebase-wide uniqueness check catches accidental clashes
   * before they hit the DB and turn into apply-time errors.
   */
  describe('aggregate: name uniqueness', () => {
    it('every index name is unique across the codebase', () => {
      const seen = new Map<string, string[]>();
      for (const idx of INDEXES) {
        if (!seen.has(idx.name)) seen.set(idx.name, []);
        seen.get(idx.name)!.push(`${idx.file}::${idx.table}`);
      }
      const duplicates = [...seen.entries()].filter(([, sites]) => sites.length > 1);
      expect(
        duplicates,
        duplicates.length > 0
          ? `Index names appearing more than once: ${duplicates
              .map(([n, sites]) => `"${n}" at [${sites.join(', ')}]`)
              .join(' | ')}`
          : 'unexpected — duplicates reported but list empty',
      ).toEqual([]);
    });
  });

  /**
   * Bidirectional stale-check for the grandfathering allowlist:
   * if an entry references an index that no longer exists, the
   * exemption is dead code and should be removed.
   */
  describe('grandfathering allowlist hygiene', () => {
    it('every NAMING_EXCEPTIONS entry still refers to an existing index', () => {
      const existing = new Set(INDEXES.map((i) => `${i.file}::${i.name}`));
      const orphans = [...NAMING_EXCEPTIONS].filter((key) => !existing.has(key));
      expect(
        orphans,
        orphans.length > 0
          ? `NAMING_EXCEPTIONS entries pointing at an index that no longer exists (renamed or dropped): ${orphans.join(', ')}. Remove these entries from the set.`
          : 'unexpected — orphans reported but list empty',
      ).toEqual([]);
    });
  });
});
