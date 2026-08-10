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

function extractCreateTable(sql: string): Array<{ table: string; body: string }> {
  const out: Array<{ table: string; body: string }> = [];
  const re = /create\s+table(?:\s+if\s+not\s+exists)?\s+([a-z_][a-z0-9_.]*)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const table = m[1]!.toLowerCase();
    const start = m.index + m[0].length;
    let depth = 1;
    let end = -1;
    for (let i = start; i < sql.length; i++) {
      const c = sql[i];
      if (c === "'") {
        i++;
        while (i < sql.length && sql[i] !== "'") i++;
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end !== -1) out.push({ table, body: sql.slice(start, end) });
  }
  return out;
}

function splitColumns(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (c === "'") {
      buf += c;
      i++;
      while (i < body.length && body[i] !== "'") {
        buf += body[i]!;
        i++;
      }
      buf += body[i] ?? '';
      continue;
    }
    if (c === '(') {
      depth++;
      buf += c;
      continue;
    }
    if (c === ')') {
      depth--;
      buf += c;
      continue;
    }
    if (c === ',' && depth === 0) {
      parts.push(buf.trim());
      buf = '';
      continue;
    }
    buf += c;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

interface UniqueConstraint {
  file: string;
  table: string;
  origin: 'table-level' | 'alter-add' | 'unique-index';
  name: string | null;
  entryPreview: string;
  indexInFile: number;
  /** Whitespace-collapsed body used for whitelist key stability. */
  bodyKey: string;
}

/**
 * Collect only naming-relevant UNIQUE constructs:
 *   - table-level `unique (...)` inside a CREATE TABLE body
 *   - `alter table ... add [constraint <n>] unique (...)`
 *   - `create unique index [if not exists] <name> on ...`
 *
 * Column-inline uniques (`col type unique`) are intentionally out of
 * scope: Postgres auto-names them `<table>_<col>_key`, which is
 * diagnostically usable (unlike CHECK constraint auto-naming). All
 * three collected forms let the author supply an explicit name, so
 * anonymous instances of them can be prohibited without loss of
 * expressiveness.
 */
function collectUniqueConstraints(): UniqueConstraint[] {
  const out: UniqueConstraint[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    let indexInFile = 0;

    for (const { table, body } of extractCreateTable(sql)) {
      for (const rawEntry of splitColumns(body)) {
        const entry = rawEntry.replace(/\s+/g, ' ').trim();
        if (!entry) continue;
        const namedMatch = entry.match(/^constraint\s+([a-z_][a-z0-9_]*)\s+unique\s*\(/i);
        if (namedMatch) {
          out.push({
            file,
            table,
            origin: 'table-level',
            name: namedMatch[1]!.toLowerCase(),
            entryPreview: entry.slice(0, 120),
            indexInFile: indexInFile++,
            bodyKey: entry,
          });
          continue;
        }
        const anonMatch = entry.match(/^unique\s*\(/i);
        if (anonMatch) {
          out.push({
            file,
            table,
            origin: 'table-level',
            name: null,
            entryPreview: entry.slice(0, 120),
            indexInFile: indexInFile++,
            bodyKey: entry,
          });
        }
      }
    }

    const alterRe =
      /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([a-z_][a-z0-9_.]*)\s+([\s\S]*?);/gi;
    let am: RegExpExecArray | null;
    while ((am = alterRe.exec(sql)) !== null) {
      const table = am[1]!.toLowerCase();
      const rest = am[2]!;
      const addUniqRe = /add\s+(?:constraint\s+([a-z_][a-z0-9_]*)\s+)?unique\s*\(/gi;
      let cm: RegExpExecArray | null;
      while ((cm = addUniqRe.exec(rest)) !== null) {
        out.push({
          file,
          table,
          origin: 'alter-add',
          name: cm[1] ? cm[1].toLowerCase() : null,
          entryPreview: `alter table ${table} add ${cm[0].slice(4).trim()}...`,
          indexInFile: indexInFile++,
          bodyKey: `alter add ${cm[0].slice(4)}`,
        });
      }
    }

    const uniIdxRe =
      /create\s+unique\s+index(?:\s+if\s+not\s+exists)?\s+([a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_.]*)/gi;
    let im: RegExpExecArray | null;
    while ((im = uniIdxRe.exec(sql)) !== null) {
      out.push({
        file,
        table: im[2]!.toLowerCase(),
        origin: 'unique-index',
        name: im[1]!.toLowerCase(),
        entryPreview: im[0]!.slice(0, 120),
        indexInFile: indexInFile++,
        bodyKey: im[0]!,
      });
    }
  }
  return out;
}

const UNIQUE_CONSTRAINTS = collectUniqueConstraints();
const TABLE_LEVEL = UNIQUE_CONSTRAINTS.filter((c) => c.origin === 'table-level');
const ALTER_ADD = UNIQUE_CONSTRAINTS.filter((c) => c.origin === 'alter-add');
const UNIQUE_INDEX = UNIQUE_CONSTRAINTS.filter((c) => c.origin === 'unique-index');

/**
 * Grandfathered anonymous table-level UNIQUE constraints. Each of
 * these was written before this guard existed and lives in a
 * migration that has already been applied to prod — rewriting the
 * SQL would trip the Supabase migration-ledger checksum, forcing a
 * manual repair on every environment. The naming is not IDEAL
 * (Postgres auto-names them `<table>_<col1>_<col2>_key`, which is
 * still readable but position-sensitive) but not catastrophic. New
 * table-level UNIQUE constraints MUST be explicitly named — this
 * list may NOT grow.
 *
 * Key format: `<file>::<table>::<whitespace-collapsed-entry>`. A
 * whitespace-only change on the entry line invalidates the key,
 * forcing a re-verification (was the change intentional? if so,
 * update the key or make it named).
 */
const TABLE_LEVEL_ANON_ALLOWLIST = new Set<string>([
  '20260801000000_init.sql::public.memberships::unique (user_id, tenant_id)',
  '20260801000000_init.sql::public.roles::unique (tenant_id, key)',
  '20260801000000_init.sql::public.user_roles::unique (user_id, role_id, tenant_id, scope_type, scope_id)',
  '20260801000000_init.sql::public.user_groups::unique (tenant_id, name)',
  '20260802000000_domain_core.sql::public.properties::unique (tenant_id, code)',
  '20260802000000_domain_core.sql::public.buildings::unique (property_id, code)',
  '20260802000000_domain_core.sql::public.units::unique (building_id, code)',
  '20260802000000_domain_core.sql::public.employees::unique (tenant_id, user_id)',
  '20260802000000_domain_core.sql::public.work_orders::unique (tenant_id, code)',
  '20260802000300_defect_reports.sql::public.defect_reports::unique (tenant_id, code)',
  '20260803000600_keys.sql::public.keys::unique (tenant_id, code)',
  '20260803000700_meters.sql::public.meters::unique (tenant_id, code)',
  '20260803000700_meters.sql::public.meter_readings::unique (meter_id, read_at)',
  '20260803000800_materials.sql::public.materials::unique (tenant_id, code)',
  '20260803000900_vehicles.sql::public.vehicles::unique (tenant_id, license_plate)',
  '20260803000900_vehicles.sql::public.vehicles::unique (tenant_id, code)',
  '20260803001000_tours.sql::public.tours::unique (tenant_id, code)',
  '20260803001000_tours.sql::public.tour_stops::unique (tour_id, sequence)',
  '20260803001100_messaging.sql::public.message_thread_participants::unique (thread_id, user_id)',
]);

describe('Migration UNIQUE-constraint naming coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many table-level UNIQUE constraints', () => {
      expect(TABLE_LEVEL.length).toBeGreaterThan(15);
    });

    it('scanner discovered some CREATE UNIQUE INDEX statements', () => {
      expect(UNIQUE_INDEX.length).toBeGreaterThanOrEqual(1);
    });

    it('every named constraint follows the identifier rules (a-z, 0-9, underscore, starts with letter or underscore)', () => {
      const bad = UNIQUE_CONSTRAINTS.filter(
        (c) => c.name !== null && !/^[a-z_][a-z0-9_]*$/.test(c.name),
      );
      expect(
        bad,
        bad.length > 0
          ? `Constraint / index names that don't match /^[a-z_][a-z0-9_]*$/: ${bad
              .map((c) => `${c.file}::${c.table} name="${c.name}"`)
              .join(', ')}`
          : 'unexpected — bad names reported but list empty',
      ).toEqual([]);
    });

    it('every named constraint / index name fits within Postgres 63-char identifier limit', () => {
      const tooLong = UNIQUE_CONSTRAINTS.filter(
        (c) => c.name !== null && c.name.length > 63,
      );
      expect(
        tooLong,
        tooLong.length > 0
          ? `Constraint / index names exceed 63 chars (Postgres will TRUNCATE, causing surprises): ${tooLong
              .map((c) => `${c.file}::${c.table} name="${c.name}" (${c.name!.length} chars)`)
              .join(', ')}`
          : 'unexpected — tooLong reported but list empty',
      ).toEqual([]);
    });
  });

  /**
   * Rule: every table-level UNIQUE constraint inside a CREATE TABLE
   * body is either explicitly named via `constraint <name> unique
   * (...)`, OR grandfathered via the allowlist (with the caveat that
   * the allowlist cannot grow).
   *
   * Postgres auto-names table-level anonymous uniques as
   * `<table>_<col1>_<col2>..._key`. That's more informative than
   * CHECK's positional auto-names but still has failure modes:
   *
   *   - Position-sensitive: reordering columns in the tuple, or
   *     adding one, changes the auto-name — and any monitoring /
   *     alerting keyed off the old name breaks silently.
   *   - Length-brittle: with long column names, `<table>_a_b_c_key`
   *     can hit the 63-char Postgres identifier limit and be
   *     TRUNCATED — a truncated auto-name is opaque and can
   *     collide across constraints (e.g., two long-tuple uniques on
   *     the same table).
   *   - Cross-migration drift: the shape of the auto-name depends
   *     on the exact tuple, so if a migration in a follow-up file
   *     shifts the tuple, the constraint name silently changes.
   *
   * An explicit name pins down the semantics and makes the intent
   * grep-able.
   */
  describe('every table-level UNIQUE constraint is explicitly named (or grandfathered)', () => {
    for (const c of TABLE_LEVEL.slice().sort((a, b) =>
      `${a.file}::${a.table}::${a.indexInFile}`.localeCompare(
        `${b.file}::${b.table}::${b.indexInFile}`,
      ),
    )) {
      const displayName = c.name ?? '<anonymous>';
      const key = `${c.file}::${c.table}::${c.bodyKey}`;
      it(`${c.table} table-level unique "${displayName}" (in ${c.file}) is named or grandfathered`, () => {
        if (TABLE_LEVEL_ANON_ALLOWLIST.has(key)) {
          expect(
            c.name,
            `${key} is in the allowlist but now HAS a name. Remove it from TABLE_LEVEL_ANON_ALLOWLIST — the exemption is stale.`,
          ).toBeNull();
          return;
        }
        expect(
          c.name,
          c.name === null
            ? `${c.table} in ${c.file} has an anonymous table-level UNIQUE constraint that is NOT in the allowlist. Wrap it in \`constraint <descriptive_snake_case_name> unique (...)\`. Anonymous UNIQUE constraints get position-sensitive Postgres auto-names (\`<table>_<col1>_<col2>_key\`) that break when columns are reordered, drift if the tuple is amended in a later migration, and can hit the 63-char identifier limit with long tuples. Entry preview: "${c.entryPreview}". If this constraint was ADDED before this guard existed and you cannot rewrite the migration (checksum lock), add "${key}" to TABLE_LEVEL_ANON_ALLOWLIST — but new writes MUST be named.`
            : 'unexpected — c.name is non-null but toBeNull fired',
        ).not.toBeNull();
      });
    }
  });

  /**
   * Rule: every `ALTER TABLE ... ADD UNIQUE (...)` clause must
   * include a `CONSTRAINT <name>` between `ADD` and `UNIQUE`. Same
   * reasoning as the CHECK guard (batch 33) — ALTER-ADD constraint
   * names are especially bad when auto-generated because the exact
   * counter depends on which OTHER constraints the table has at
   * apply-time, so staging vs. prod can pick up different names for
   * the same migration. There's no grandfathering here because
   * there are currently zero ALTER-ADD uniques in any migration.
   */
  describe('every ALTER TABLE ADD UNIQUE constraint is explicitly named', () => {
    if (ALTER_ADD.length === 0) {
      it('(no ALTER TABLE ADD UNIQUE statements in any migration — baseline is trivially green)', () => {
        expect(ALTER_ADD).toEqual([]);
      });
    } else {
      for (const c of ALTER_ADD.slice().sort((a, b) =>
        `${a.file}::${a.table}::${a.indexInFile}`.localeCompare(
          `${b.file}::${b.table}::${b.indexInFile}`,
        ),
      )) {
        const displayName = c.name ?? '<anonymous>';
        it(`${c.table} alter-add unique "${displayName}" (in ${c.file}) is named`, () => {
          expect(
            c.name,
            c.name === null
              ? `${c.table} in ${c.file} has an anonymous ALTER TABLE ADD UNIQUE clause. Auto-generated constraint names for ALTER-ADD uniques depend on apply-order, so the same migration can produce different constraint names in staging vs. prod. Add \`constraint <descriptive_snake_case_name>\` between \`add\` and \`unique\`. Entry preview: "${c.entryPreview}"`
              : 'unexpected — c.name is non-null but toBeNull fired',
          ).not.toBeNull();
        });
      }
    }
  });

  /**
   * Rule: every `CREATE UNIQUE INDEX` statement uses an explicit
   * name. This is a syntactic requirement for named indexes (an
   * anonymous form exists — `create unique index on ...` without a
   * name — where Postgres auto-generates), so the guard prevents
   * the anonymous form from sneaking in.
   */
  describe('every CREATE UNIQUE INDEX statement is explicitly named', () => {
    for (const c of UNIQUE_INDEX.slice().sort((a, b) =>
      `${a.file}::${a.table}::${a.indexInFile}`.localeCompare(
        `${b.file}::${b.table}::${b.indexInFile}`,
      ),
    )) {
      it(`${c.table} unique index "${c.name}" (in ${c.file}) is named`, () => {
        expect(
          c.name,
          `${c.table} in ${c.file}: a CREATE UNIQUE INDEX statement without an explicit name would let Postgres auto-generate. Always write \`create unique index [if not exists] <descriptive_name>_idx on ...\`. Entry preview: "${c.entryPreview}"`,
        ).not.toBeNull();
      });
    }
  });

  /**
   * Stale-entry check: catch allowlist bloat. Any allowlisted key
   * that no longer maps to a real anon table-level UNIQUE (because
   * the constraint was removed/renamed/named) is dead weight and
   * masks future regressions in this area.
   */
  describe('TABLE_LEVEL_ANON_ALLOWLIST is not stale', () => {
    it('every allowlist entry points to a real anonymous table-level UNIQUE', () => {
      const knownAnonKeys = new Set(
        TABLE_LEVEL.filter((c) => c.name === null).map(
          (c) => `${c.file}::${c.table}::${c.bodyKey}`,
        ),
      );
      const orphans = [...TABLE_LEVEL_ANON_ALLOWLIST].filter((k) => !knownAnonKeys.has(k));
      expect(
        orphans,
        orphans.length > 0
          ? `TABLE_LEVEL_ANON_ALLOWLIST contains keys that no longer match any scanned anon UNIQUE constraint: ${orphans.join(', ')}. Either the constraint was removed/renamed/named or the extractor no longer sees it; the allowlist entry is dead weight — remove it.`
          : 'unexpected — orphans reported but list empty',
      ).toEqual([]);
    });
  });
});
