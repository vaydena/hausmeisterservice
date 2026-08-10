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

interface CheckConstraint {
  file: string;
  table: string;
  origin: 'table-level' | 'alter-add';
  name: string | null;
  entryPreview: string;
  indexInFile: number;
}

/**
 * Collect only table-level and ALTER-TABLE ADD check constraints.
 * Column-inline anonymous checks (`col text check (col in (...))`) are
 * intentionally out of scope — Postgres names them
 * `<table>_<column>_check`, which is diagnostically usable in error
 * messages. Table-level and ALTER-TABLE ADD anonymous checks get
 * numbered names (`<table>_check1`, `<table>_check2`) that convey zero
 * information about WHICH invariant was violated, so those must be
 * explicitly named.
 */
function collectCheckConstraints(): CheckConstraint[] {
  const out: CheckConstraint[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    let indexInFile = 0;

    // 1. Table-level CHECK inside CREATE TABLE (...).
    for (const { table, body } of extractCreateTable(sql)) {
      for (const rawEntry of splitColumns(body)) {
        const entry = rawEntry.replace(/\s+/g, ' ').trim();
        if (!entry) continue;
        const namedMatch = entry.match(/^constraint\s+([a-z_][a-z0-9_]*)\s+check\s*\(/i);
        if (namedMatch) {
          out.push({
            file,
            table,
            origin: 'table-level',
            name: namedMatch[1]!.toLowerCase(),
            entryPreview: entry.slice(0, 120),
            indexInFile: indexInFile++,
          });
          continue;
        }
        const anonMatch = entry.match(/^check\s*\(/i);
        if (anonMatch) {
          out.push({
            file,
            table,
            origin: 'table-level',
            name: null,
            entryPreview: entry.slice(0, 120),
            indexInFile: indexInFile++,
          });
        }
      }
    }

    // 2. ALTER TABLE ... ADD [CONSTRAINT <name>] CHECK (...).
    // Split each ALTER statement on `;` to get the clause; scan clauses.
    const alterRe =
      /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([a-z_][a-z0-9_.]*)\s+([\s\S]*?);/gi;
    let am: RegExpExecArray | null;
    while ((am = alterRe.exec(sql)) !== null) {
      const table = am[1]!.toLowerCase();
      const rest = am[2]!;
      const addCheckRe =
        /add\s+(?:constraint\s+([a-z_][a-z0-9_]*)\s+)?check\s*\(/gi;
      let cm: RegExpExecArray | null;
      while ((cm = addCheckRe.exec(rest)) !== null) {
        out.push({
          file,
          table,
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

const CHECK_CONSTRAINTS = collectCheckConstraints();
const TABLE_LEVEL = CHECK_CONSTRAINTS.filter((c) => c.origin === 'table-level');
const ALTER_ADD = CHECK_CONSTRAINTS.filter((c) => c.origin === 'alter-add');

describe('Migration CHECK-constraint naming coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many table-level CHECK constraints', () => {
      expect(TABLE_LEVEL.length).toBeGreaterThan(20);
    });

    it('scanner discovered some ALTER TABLE ADD CHECK constraints', () => {
      expect(ALTER_ADD.length).toBeGreaterThanOrEqual(1);
    });

    it('every named constraint follows the identifier rules (a-z, 0-9, underscore, starts with letter or underscore)', () => {
      const bad = CHECK_CONSTRAINTS.filter(
        (c) => c.name !== null && !/^[a-z_][a-z0-9_]*$/.test(c.name),
      );
      expect(
        bad,
        bad.length > 0
          ? `Constraint names that don't match /^[a-z_][a-z0-9_]*$/: ${bad
              .map((c) => `${c.file}::${c.table} name="${c.name}"`)
              .join(', ')}`
          : 'unexpected — bad names reported but list empty',
      ).toEqual([]);
    });
  });

  /**
   * Rule: every table-level CHECK constraint (i.e. a `check (...)` that
   * appears as its own top-level entry in a `create table (...)` body,
   * NOT inline on a column) must be named with `constraint <name>
   * check (...)`.
   *
   * Failure mode of anonymous table-level checks:
   *
   *   - Postgres auto-names them `<table>_check1`, `<table>_check2`,
   *     etc. — a purely positional name that conveys ZERO information
   *     about which invariant was violated.
   *   - When an INSERT/UPDATE fails, Supabase surfaces the constraint
   *     name in the error toast. `check_violation:
   *     time_entries_check3` gives the user no way to understand what
   *     went wrong; `check_violation:
   *     time_entries_end_after_start` immediately tells them what to
   *     fix.
   *   - Support / observability tooling that greps postgres logs for
   *     recurring constraint hits gets a per-table bucket instead of
   *     a per-invariant bucket — collapsing distinct issues into one
   *     noisy heap.
   *   - The auto-numbering is ALSO position-dependent: reorder or
   *     split a create-table body and the same invariant now has a
   *     different name, invalidating any monitoring / alerting rules
   *     that key off the old name.
   *
   * Column-inline anonymous checks (`col text check (col in (...))`)
   * are out of scope here — Postgres names them `<table>_<col>_check`
   * which is diagnostically usable. Only table-level and ALTER-TABLE
   * ADD anonymous checks are the failure mode this rule prevents.
   */
  describe('every table-level CHECK constraint is explicitly named', () => {
    for (const c of TABLE_LEVEL.slice().sort((a, b) =>
      `${a.file}::${a.table}::${a.indexInFile}`.localeCompare(
        `${b.file}::${b.table}::${b.indexInFile}`,
      ),
    )) {
      const displayName = c.name ?? '<anonymous>';
      it(`${c.table} table-level check "${displayName}" (in ${c.file}) is named`, () => {
        expect(
          c.name,
          c.name === null
            ? `${c.table} in ${c.file} has an anonymous table-level CHECK constraint. Postgres will auto-name it \`${c.table.replace(/^public\./, '')}_check<N>\` (positional) — the resulting error message on a violation gives the reader no clue which invariant was actually violated. Wrap the check in \`constraint <descriptive_snake_case_name> check (...)\` so violations surface a readable name. Entry preview: "${c.entryPreview}"`
            : 'unexpected — c.name is non-null but toBeNull fired',
        ).not.toBeNull();
      });
    }
  });

  /**
   * Rule: every `ALTER TABLE ... ADD CHECK (...)` clause must include
   * a `CONSTRAINT <name>` between `ADD` and `CHECK`. Same reasoning as
   * the table-level rule above — Postgres will auto-number these too,
   * but WORSE, because ALTER-TABLE-ADD checks are usually additive
   * migrations layered on an already-shipped schema, so the auto-name
   * depends on which OTHER checks the table already has at apply-time.
   * A migration that lands second in staging vs. third in prod can
   * pick up different auto-names, meaning error messages diverge
   * across environments — a monitoring nightmare.
   */
  describe('every ALTER TABLE ADD CHECK constraint is explicitly named', () => {
    for (const c of ALTER_ADD.slice().sort((a, b) =>
      `${a.file}::${a.table}::${a.indexInFile}`.localeCompare(
        `${b.file}::${b.table}::${b.indexInFile}`,
      ),
    )) {
      const displayName = c.name ?? '<anonymous>';
      it(`${c.table} alter-add check "${displayName}" (in ${c.file}) is named`, () => {
        expect(
          c.name,
          c.name === null
            ? `${c.table} in ${c.file} has an anonymous ALTER TABLE ADD CHECK constraint. Auto-numbered names for ALTER-ADD checks are especially bad because the number depends on how many checks the table has at APPLY time — the same migration can produce different constraint names in staging and prod. Add \`constraint <descriptive_snake_case_name>\` between \`add\` and \`check\`. Entry preview: "${c.entryPreview}"`
            : 'unexpected — c.name is non-null but toBeNull fired',
        ).not.toBeNull();
      });
    }
  });

  /**
   * Aggregate: baseline invariant. This surfaces an easily-readable
   * summary if the per-item loop somehow misses a case (e.g. a
   * parser edge that shouldn't happen). If it ever fires, one of
   * the per-item tests above must also be failing — this is
   * belt-and-suspenders for the aggregate view.
   */
  describe('aggregate baseline', () => {
    it('has zero anonymous table-level CHECK constraints across all migrations', () => {
      const anon = TABLE_LEVEL.filter((c) => c.name === null);
      expect(
        anon,
        anon.length > 0
          ? `anonymous table-level CHECKs found (${anon.length}): ${anon
              .map((c) => `${c.file}::${c.table} — ${c.entryPreview}`)
              .join(' | ')}`
          : 'unexpected — anon reported but list empty',
      ).toEqual([]);
    });

    it('has zero anonymous ALTER TABLE ADD CHECK constraints across all migrations', () => {
      const anon = ALTER_ADD.filter((c) => c.name === null);
      expect(
        anon,
        anon.length > 0
          ? `anonymous alter-add CHECKs found (${anon.length}): ${anon
              .map((c) => `${c.file}::${c.table} — ${c.entryPreview}`)
              .join(' | ')}`
          : 'unexpected — anon reported but list empty',
      ).toEqual([]);
    });
  });
});
