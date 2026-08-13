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

interface ForeignKey {
  file: string;
  table: string;
  shortTable: string;
  origin: 'column-inline' | 'table-level' | 'alter-add';
  name: string | null;
  colName?: string;
  autoName?: string;
  entryPreview: string;
  indexInFile: number;
}

/**
 * Collect every foreign-key declaration across all migrations.
 *
 * Three categories:
 *
 *   1. Column-inline:  `col type ... references other(id)`
 *      → Postgres auto-names as `<shortTable>_<col>_fkey`. This is the
 *        established convention in this codebase and diagnostically
 *        useful.
 *   2. Table-level:    `foreign key (col) references other(id)` (anon)
 *                       or `constraint <n> foreign key (...)` (named)
 *      → Anonymous variants get positional auto-names
 *        (`<table>_fkey<N>`) — same failure mode as anon CHECK/UNIQUE.
 *   3. ALTER TABLE ADD: `alter table ... add [constraint <n>] foreign key (...) references ...`
 *      → Auto-names depend on apply-order at the target database —
 *        staging and prod can diverge.
 */
function collectForeignKeys(): ForeignKey[] {
  const out: ForeignKey[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    let indexInFile = 0;

    for (const { table, body } of extractCreateTable(sql)) {
      const shortTable = table.replace(/^public\./, '');
      for (const rawEntry of splitColumns(body)) {
        const entry = rawEntry.replace(/\s+/g, ' ').trim();
        if (!entry) continue;

        // Table-level named FK: `constraint <n> foreign key (...)`
        const namedTableLevel = entry.match(
          /^constraint\s+([a-z_][a-z0-9_]*)\s+foreign\s+key\s*\(/i,
        );
        if (namedTableLevel) {
          out.push({
            file,
            table,
            shortTable,
            origin: 'table-level',
            name: namedTableLevel[1]!.toLowerCase(),
            entryPreview: entry.slice(0, 120),
            indexInFile: indexInFile++,
          });
          continue;
        }

        // Table-level anonymous FK: `foreign key (...)`
        const anonTableLevel = entry.match(/^foreign\s+key\s*\(/i);
        if (anonTableLevel) {
          out.push({
            file,
            table,
            shortTable,
            origin: 'table-level',
            name: null,
            entryPreview: entry.slice(0, 120),
            indexInFile: indexInFile++,
          });
          continue;
        }

        // Skip other constraint-leads
        if (/^(constraint|primary\s+key|unique|check|exclude|like)\b/i.test(entry)) continue;

        // Column-inline FK detection: entry starts with a column identifier
        // AND contains `references <table>` somewhere.
        const colName = entry.match(/^([a-z_][a-z0-9_]*)\b/i);
        if (!colName) continue;
        if (!/\breferences\s+[a-z_][a-z0-9_.]*/i.test(entry)) continue;

        const col = colName[1]!.toLowerCase();
        const autoName = `${shortTable}_${col}_fkey`;
        out.push({
          file,
          table,
          shortTable,
          origin: 'column-inline',
          name: null,
          colName: col,
          autoName,
          entryPreview: entry.slice(0, 120),
          indexInFile: indexInFile++,
        });
      }
    }

    // ALTER TABLE ... ADD [CONSTRAINT <n>] FOREIGN KEY (...)
    const alterRe =
      /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([a-z_][a-z0-9_.]*)\s+([\s\S]*?);/gi;
    let am: RegExpExecArray | null;
    while ((am = alterRe.exec(sql)) !== null) {
      const table = am[1]!.toLowerCase();
      const shortTable = table.replace(/^public\./, '');
      const rest = am[2]!;
      const addFkRe =
        /add\s+(?:constraint\s+([a-z_][a-z0-9_]*)\s+)?foreign\s+key\s*\(/gi;
      let cm: RegExpExecArray | null;
      while ((cm = addFkRe.exec(rest)) !== null) {
        out.push({
          file,
          table,
          shortTable,
          origin: 'alter-add',
          name: cm[1] ? cm[1].toLowerCase() : null,
          entryPreview: `alter table ${table} add ${cm[0].slice(4).trim()}...`,
          indexInFile: indexInFile++,
        });
      }
    }
  }
  return out;
}

const FOREIGN_KEYS = collectForeignKeys();
const COLUMN_INLINE = FOREIGN_KEYS.filter((f) => f.origin === 'column-inline');
const TABLE_LEVEL = FOREIGN_KEYS.filter((f) => f.origin === 'table-level');
const ALTER_ADD = FOREIGN_KEYS.filter((f) => f.origin === 'alter-add');

// Postgres truncates identifiers longer than 63 chars silently.
const PG_MAX_IDENT = 63;

/**
 * Named, intentional `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY (...)`
 * clauses. Every entry MUST use `constraint <name>` — the ALTER-ADD-named-FK
 * per-item test below still enforces that. This allowlist ONLY exempts the
 * entries from the codebase-wide "column-inline is the only FK style"
 * baseline, so that fixup-migrations which have no choice but to alter an
 * existing constraint (e.g. changing `on delete restrict` → `on delete
 * cascade` after the table already exists in prod) can ship without
 * pretending the FK could still be expressed column-inline.
 *
 * Key format: `${file}::${table}::${name}`.
 *
 *  - 20260813130000_platform_invoices_tenant_cascade.sql
 *    ::platform.invoices::invoices_tenant_id_fkey
 *      The original migration (20260812081218_platform_layer_and_subscriptions)
 *      declared `tenant_id ... references public.tenants(id) on delete restrict`.
 *      `restrict` is wrong for tenant-rooted data (tenants can't be deleted
 *      once they have platform invoices). The corrective migration must
 *      drop-and-re-add the existing constraint on already-deployed prod DBs,
 *      which mandates ALTER TABLE syntax. Constraint is named
 *      `invoices_tenant_id_fkey` to match the Postgres auto-name the fresh-DB
 *      column-inline declaration produces, so `\d+ platform.invoices` shows the
 *      same constraint name regardless of migration path.
 */
const INTENTIONAL_ALTER_ADD_FKS = new Set<string>([
  '20260813130000_platform_invoices_tenant_cascade.sql::platform.invoices::invoices_tenant_id_fkey',
]);

describe('Migration foreign-key naming coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many foreign keys (>= 150)', () => {
      expect(FOREIGN_KEYS.length).toBeGreaterThanOrEqual(150);
    });

    it('column-inline is the only FK style currently in use (except for entries on INTENTIONAL_ALTER_ADD_FKS)', () => {
      // If this fires, someone added the first table-level FK, or an ALTER-ADD
      // FK that isn't on the intentional allowlist. The per-item baseline
      // tests below will tell you whether the offending FK is named; if it's
      // a legitimate fixup-migration (e.g. changing `on delete` semantics on
      // an already-deployed constraint), add it to INTENTIONAL_ALTER_ADD_FKS
      // with a written rationale.
      const unintendedAlterAdd = ALTER_ADD.filter(
        (f) => !INTENTIONAL_ALTER_ADD_FKS.has(`${f.file}::${f.table}::${f.name}`),
      );
      const unexplainedNonColumnInline = TABLE_LEVEL.length + unintendedAlterAdd.length;
      expect(
        unexplainedNonColumnInline,
        unexplainedNonColumnInline > 0
          ? `Non-column-inline FKs without an INTENTIONAL_ALTER_ADD_FKS entry: table-level=${TABLE_LEVEL.length}, alter-add=${unintendedAlterAdd
              .map((f) => `${f.file}::${f.table}::${f.name}`)
              .join(', ')}. Column-inline (\`col type references other(id)\`) is preferred because the FK auto-name mirrors the column name and stays stable across environments. If this is a genuine fixup-migration that must ALTER an existing constraint, add the key to INTENTIONAL_ALTER_ADD_FKS.`
          : 'unexpected — non-column-inline reported but list empty',
      ).toBe(0);
    });

    it('every explicitly-named FK follows Postgres identifier rules', () => {
      const bad = FOREIGN_KEYS.filter(
        (f) => f.name !== null && !/^[a-z_][a-z0-9_]*$/.test(f.name),
      );
      expect(
        bad,
        bad.length > 0
          ? `FK names that don't match /^[a-z_][a-z0-9_]*$/: ${bad
              .map((f) => `${f.file}::${f.table} name="${f.name}"`)
              .join(', ')}`
          : 'unexpected — bad names reported but list empty',
      ).toEqual([]);
    });

    it('every explicitly-named FK is within the 63-char Postgres identifier limit', () => {
      const oversized = FOREIGN_KEYS.filter(
        (f) => f.name !== null && f.name.length > PG_MAX_IDENT,
      );
      expect(
        oversized,
        oversized.length > 0
          ? `FK names > 63 chars (Postgres will TRUNCATE silently, risking collision): ${oversized
              .map((f) => `${f.file}::${f.table} name="${f.name}" (${f.name!.length} chars)`)
              .join(', ')}`
          : 'unexpected — oversized reported but list empty',
      ).toEqual([]);
    });
  });

  /**
   * Rule: Postgres auto-names each column-inline FK as
   * `<shortTable>_<col>_fkey`. Because Postgres silently TRUNCATES
   * identifiers to 63 chars, any (table, column) pair whose
   * auto-name would exceed 63 chars generates a truncated name that:
   *
   *   - obscures the FK identity in `\d+ <table>` output and log lines,
   *   - can COLLIDE with another auto-generated FK whose full name
   *     shared the same first 63 chars (Postgres will reject the
   *     second CREATE with a duplicate-constraint error, or worse,
   *     leave the schema in a broken half-applied state).
   *
   * Enforcing the length check per-FK means each new column-inline
   * FK is validated the moment it's added, before it can ship as a
   * migration.
   */
  describe('every column-inline FK generates an auto-name within the 63-char Postgres identifier limit', () => {
    for (const fk of COLUMN_INLINE.slice().sort((a, b) =>
      `${a.file}::${a.table}::${a.indexInFile}`.localeCompare(
        `${b.file}::${b.table}::${b.indexInFile}`,
      ),
    )) {
      it(`${fk.shortTable}.${fk.colName} auto-name "${fk.autoName}" (${fk.autoName!.length} chars, in ${fk.file}) fits in 63 chars`, () => {
        expect(
          fk.autoName!.length,
          fk.autoName!.length > PG_MAX_IDENT
            ? `Postgres auto-name "${fk.autoName}" for FK ${fk.shortTable}.${fk.colName} in ${fk.file} is ${fk.autoName!.length} chars > 63. Postgres will TRUNCATE the name silently, obscuring the FK identity in error messages and risking name collisions with any other FK whose truncated name coincides. Fix by either renaming the source column, promoting the FK to a table-level named constraint (\`constraint <shorter_name> foreign key (${fk.colName}) references ...\`), or moving to an ALTER TABLE ADD CONSTRAINT with an explicit name.`
            : 'unexpected — length within limit but assertion fired',
        ).toBeLessThanOrEqual(PG_MAX_IDENT);
      });
    }
  });

  /**
   * Rule: every table-level FK entry inside a `create table (...)`
   * body must be named with `constraint <name> foreign key (...)`.
   *
   * Failure mode of anonymous table-level FKs:
   *
   *   - Postgres auto-names them positionally as
   *     `<table>_fkey`, `<table>_fkey1`, `<table>_fkey2` — the
   *     numeric suffix conveys zero information about WHICH
   *     relationship failed.
   *   - The numbering is position-dependent: reorder the create-table
   *     body and the same FK now has a different name, breaking any
   *     monitoring or documentation that keyed off the old one.
   *   - Multi-column FKs REQUIRE table-level syntax, so this rule
   *     matters as soon as anyone adds their first one.
   *
   * Column-inline FKs are out of scope here — Postgres names them
   * `<table>_<col>_fkey` (diagnostically useful) and the length check
   * above handles the truncation risk.
   */
  describe('every table-level FK inside CREATE TABLE is explicitly named', () => {
    if (TABLE_LEVEL.length === 0) {
      it('baseline: no table-level FKs exist yet (this suite becomes non-trivial the moment one is added)', () => {
        expect(TABLE_LEVEL.length).toBe(0);
      });
    } else {
      for (const fk of TABLE_LEVEL.slice().sort((a, b) =>
        `${a.file}::${a.table}::${a.indexInFile}`.localeCompare(
          `${b.file}::${b.table}::${b.indexInFile}`,
        ),
      )) {
        const displayName = fk.name ?? '<anonymous>';
        it(`${fk.table} table-level FK "${displayName}" (in ${fk.file}) is named`, () => {
          expect(
            fk.name,
            fk.name === null
              ? `${fk.table} in ${fk.file} has an anonymous table-level FOREIGN KEY. Postgres will auto-name it positionally (\`${fk.shortTable}_fkey<N>\`) — the resulting error message on a violation tells the reader nothing about which relationship failed. Wrap the FK in \`constraint <descriptive_snake_case_name> foreign key (col) references other(id)\` so violations surface a readable name. Entry preview: "${fk.entryPreview}"`
              : 'unexpected — fk.name is non-null but toBeNull fired',
          ).not.toBeNull();
        });
      }
    }
  });

  /**
   * Rule: every `ALTER TABLE ... ADD FOREIGN KEY (...)` clause must
   * include a `CONSTRAINT <name>` between `ADD` and `FOREIGN KEY`.
   *
   * ALTER-TABLE-ADD anonymous FKs are worse than table-level ones —
   * the auto-name depends on how many FKs the table already has AT
   * APPLY TIME. A migration that lands second in staging vs. third
   * in prod picks up different auto-names, so error messages diverge
   * across environments. Naming the FK freezes the identifier and
   * makes the migration environment-independent.
   */
  describe('every ALTER TABLE ADD FOREIGN KEY is explicitly named', () => {
    if (ALTER_ADD.length === 0) {
      it('baseline: no ALTER TABLE ADD FOREIGN KEYs exist yet (this suite becomes non-trivial the moment one is added)', () => {
        expect(ALTER_ADD.length).toBe(0);
      });
    } else {
      for (const fk of ALTER_ADD.slice().sort((a, b) =>
        `${a.file}::${a.table}::${a.indexInFile}`.localeCompare(
          `${b.file}::${b.table}::${b.indexInFile}`,
        ),
      )) {
        const displayName = fk.name ?? '<anonymous>';
        it(`${fk.table} alter-add FK "${displayName}" (in ${fk.file}) is named`, () => {
          expect(
            fk.name,
            fk.name === null
              ? `${fk.table} in ${fk.file} has an anonymous ALTER TABLE ADD FOREIGN KEY. Auto-numbered names for ALTER-ADD FKs are especially bad because the number depends on how many FKs the table already has at APPLY time — the same migration can produce different constraint names in staging and prod. Add \`constraint <descriptive_snake_case_name>\` between \`add\` and \`foreign key\`. Entry preview: "${fk.entryPreview}"`
              : 'unexpected — fk.name is non-null but toBeNull fired',
          ).not.toBeNull();
        });
      }
    }
  });

  /**
   * Aggregate invariants. Belt-and-suspenders for the per-item loops
   * above: if the loop somehow misses a case (e.g. a parser edge that
   * shouldn't happen), the aggregate view catches it with a compact
   * failure message listing every offender.
   */
  describe('INTENTIONAL_ALTER_ADD_FKS entries stay stale-relevant', () => {
    it('every entry still matches a named alter-add FK in the migrations', () => {
      const errors: string[] = [];
      const seen = new Set(
        ALTER_ADD.filter((f) => f.name !== null).map((f) => `${f.file}::${f.table}::${f.name}`),
      );
      for (const key of INTENTIONAL_ALTER_ADD_FKS) {
        if (!seen.has(key)) {
          errors.push(
            `INTENTIONAL_ALTER_ADD_FKS contains "${key}" but no named ALTER TABLE ADD FOREIGN KEY with that file/table/name exists in supabase/migrations/. Either the fixup was removed, or the constraint was renamed. Delete the allowlist entry.`,
          );
        }
      }
      expect(errors, errors.join('\n')).toEqual([]);
    });
  });

  describe('aggregate baseline', () => {
    it('has zero anonymous table-level FKs across all migrations', () => {
      const anon = TABLE_LEVEL.filter((f) => f.name === null);
      expect(
        anon,
        anon.length > 0
          ? `anonymous table-level FKs found (${anon.length}): ${anon
              .map((f) => `${f.file}::${f.table} — ${f.entryPreview}`)
              .join(' | ')}`
          : 'unexpected — anon reported but list empty',
      ).toEqual([]);
    });

    it('has zero anonymous ALTER TABLE ADD FKs across all migrations', () => {
      const anon = ALTER_ADD.filter((f) => f.name === null);
      expect(
        anon,
        anon.length > 0
          ? `anonymous alter-add FKs found (${anon.length}): ${anon
              .map((f) => `${f.file}::${f.table} — ${f.entryPreview}`)
              .join(' | ')}`
          : 'unexpected — anon reported but list empty',
      ).toEqual([]);
    });

    it('has zero column-inline FK auto-names exceeding 63 chars', () => {
      const oversized = COLUMN_INLINE.filter(
        (f) => f.autoName!.length > PG_MAX_IDENT,
      );
      expect(
        oversized,
        oversized.length > 0
          ? `column-inline FKs whose auto-name > 63 chars (${oversized.length}): ${oversized
              .map((f) => `${f.file}::${f.shortTable}.${f.colName} → "${f.autoName}" (${f.autoName!.length})`)
              .join(' | ')}`
          : 'unexpected — oversized reported but list empty',
      ).toEqual([]);
    });
  });
});
