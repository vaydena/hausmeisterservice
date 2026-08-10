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
 * Extract every `create table [if not exists] <schema>.<name> ( ... );`
 * statement — capturing the (possibly schema-qualified) name and the
 * parenthesized column-list body. Paren-depth tracked; single-quoted
 * strings skipped.
 */
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

/**
 * Split a parenthesized `create table` body into top-level
 * comma-separated entries — one per column or table-level constraint.
 * Paren-depth tracked; single-quoted string literals skipped.
 */
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

const CONSTRAINT_LEAD_RE =
  /^(constraint|primary\s+key|unique|check|foreign\s+key|exclude|like)\b/i;

/**
 * A column entry is a FK-to-tenants iff its body contains
 * `references [public.]tenants(id)`. Both schema-qualified and
 * implicit-schema variants are treated equivalently — Postgres resolves
 * the unqualified name via `search_path`, which in Supabase migrations
 * is always `public` first.
 */
const TENANT_FK_RE =
  /\breferences\s+(?:public\.)?tenants\s*\(\s*id\s*\)/i;

interface Column {
  file: string;
  table: string;
  colName: string;
  entry: string;
}

function collectAllColumns(): Column[] {
  const out: Column[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    for (const { table, body } of extractCreateTable(sql)) {
      for (const rawEntry of splitColumns(body)) {
        const entry = rawEntry.replace(/\s+/g, ' ').trim();
        if (!entry) continue;
        if (CONSTRAINT_LEAD_RE.test(entry)) continue;
        const nm = entry.match(/^([a-z_][a-z0-9_]*)\b/i);
        if (!nm) continue;
        out.push({ file, table, colName: nm[1]!.toLowerCase(), entry });
      }
    }
  }
  return out;
}

const ALL_COLUMNS = collectAllColumns();
const TENANT_FK_COLUMNS = ALL_COLUMNS.filter((c) => TENANT_FK_RE.test(c.entry));
const TENANT_NAMED_COLUMNS = ALL_COLUMNS.filter((c) => c.colName.includes('tenant'));

/**
 * The canonical tenant-scope column name across the whole schema. Every
 * table that scopes its rows to a tenant MUST call the column exactly
 * this — no `tenantid`, no `tenant`, no `owner_tenant`, no
 * `tenant_uuid`, no `tid`. The invariant is load-bearing for
 * several other guard suites and for the runtime:
 *
 *   - `tests/rls-policy-tenant-scope-coverage.test.ts` (batch 18)
 *     matches `tenant_id = ...` inside every RLS policy body. A
 *     column named anything else silently escapes that guard.
 *   - `tests/rls-permission-key-coverage.test.ts` (batch 10) assumes
 *     `permissions.has('...', 'tenant', ...)` scoping keys off a
 *     column named `tenant_id`.
 *   - `app_auth.current_tenant_id()` / `app_auth.is_tenant_member()`
 *     helpers throughout the SQL layer expect `tenant_id`.
 *   - The generated Supabase types (`src/lib/supabase/types.ts`)
 *     surface the column name as-is; every server-action `.eq(...)`
 *     call is compiled against those types. A rename would ripple
 *     through every module.
 */
const CANONICAL_TENANT_COLUMN = 'tenant_id';

describe('Tenant-column naming consistency coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many table columns', () => {
      expect(ALL_COLUMNS.length).toBeGreaterThan(400);
    });
    it('scanner discovered many tenant-FK columns', () => {
      expect(TENANT_FK_COLUMNS.length).toBeGreaterThan(20);
    });
    it('scanner discovered at least as many tenant-named columns as tenant-FK columns', () => {
      // Every tenant-FK column is named `tenant_id` so every one is
      // also a tenant-named column. The reverse should also hold if
      // naming is consistent (see the bidirectional test below).
      expect(TENANT_NAMED_COLUMNS.length).toBeGreaterThanOrEqual(TENANT_FK_COLUMNS.length);
    });
  });

  describe('every tenant-FK column is named `tenant_id`', () => {
    for (const c of TENANT_FK_COLUMNS.slice().sort((a, b) =>
      `${a.table}.${a.colName}`.localeCompare(`${b.table}.${b.colName}`),
    )) {
      it(`${c.table}.${c.colName} (defined in ${c.file}) is named "${CANONICAL_TENANT_COLUMN}"`, () => {
        expect(
          c.colName,
          `${c.table}.${c.colName} in ${c.file} has a foreign-key reference to public.tenants(id) but the column is named "${c.colName}", not "${CANONICAL_TENANT_COLUMN}". The canonical name is load-bearing: rls-policy-tenant-scope-coverage (batch 18) greps for \`tenant_id = ...\` inside every policy body and would silently NOT detect this column, meaning cross-tenant RLS on this table could be broken with the tenant-scope guard still passing. Rename the column to \`tenant_id\` and update every consumer (RLS policies, server actions, app_auth helpers, generated Supabase types).`,
        ).toBe(CANONICAL_TENANT_COLUMN);
      });
    }
  });

  describe('every column whose name contains "tenant" is either the canonical `tenant_id` or an intentional alias', () => {
    for (const c of TENANT_NAMED_COLUMNS.slice().sort((a, b) =>
      `${a.table}.${a.colName}`.localeCompare(`${b.table}.${b.colName}`),
    )) {
      it(`${c.table}.${c.colName} (defined in ${c.file}) is the canonical name`, () => {
        expect(
          c.colName,
          `${c.table}.${c.colName} in ${c.file} contains "tenant" in its name but is NOT the canonical \`${CANONICAL_TENANT_COLUMN}\`. If it's meant to be the tenant-scope column, rename it to \`tenant_id\`. If it's genuinely something else (e.g. \`assigning_tenant_id\` for a cross-tenant transfer log), the column should probably not contain "tenant" in the name at all — pick a different name that makes the semantics obvious. There is NO allowlist for tenant-named columns other than \`tenant_id\` — the invariant is that the substring "tenant" in a column name means "this is the tenant-scope reference".`,
        ).toBe(CANONICAL_TENANT_COLUMN);
      });
    }
  });

  describe('tenant-FK columns and tenant-named columns are the same set', () => {
    it('every tenant-named column is also a tenant-FK column (no orphaned tenant-named columns)', () => {
      const fkKeys = new Set(TENANT_FK_COLUMNS.map((c) => `${c.file}::${c.table}.${c.colName}`));
      const namedButNotFk = TENANT_NAMED_COLUMNS.filter(
        (c) => !fkKeys.has(`${c.file}::${c.table}.${c.colName}`),
      );
      expect(
        namedButNotFk,
        namedButNotFk.length > 0
          ? `\nThe following columns are named with "tenant" in the name but do NOT have a foreign-key reference to public.tenants(id):\n${namedButNotFk
              .map(
                (c) =>
                  `  ${c.file}: ${c.table}.${c.colName}\n      ${c.entry.slice(0, 120)}`,
              )
              .join(
                '\n',
              )}\n\nThat means the column is called \`tenant_id\` (or similar) but does not actually reference the tenants table. Two possible fixes: (a) if the column IS supposed to be a tenant-scope reference, add \`references public.tenants(id) on delete cascade\` to close the FK gap — a soft-typed uuid column is a common source of bugs when the referenced tenant is later deleted. (b) if the column is genuinely something else (an unrelated uuid that happens to be named with "tenant"), rename it so the invariant "column named tenant_id ↔ FK to tenants" holds — the naming convention is what several other guards depend on.`
          : 'unexpected — sets diverged but no orphans reported',
      ).toEqual([]);
    });

    it('every tenant-FK column is also a tenant-named column (no anonymous tenant references)', () => {
      const fkNotNamed = TENANT_FK_COLUMNS.filter((c) => !c.colName.includes('tenant'));
      expect(
        fkNotNamed,
        fkNotNamed.length > 0
          ? `\nThe following columns have a foreign-key reference to public.tenants(id) but their name does NOT contain "tenant":\n${fkNotNamed
              .map(
                (c) =>
                  `  ${c.file}: ${c.table}.${c.colName}\n      ${c.entry.slice(0, 120)}`,
              )
              .join(
                '\n',
              )}\n\nEven if the covering test above (every tenant-FK column is named \`tenant_id\`) passes, having an FK to tenants(id) under a completely unrelated name (like \`owner\` or \`creator\`) obscures the tenant-scope semantics and breaks any grep-based auditing. Rename the column to \`tenant_id\`.`
          : 'unexpected — sets diverged but no anonymous FKs reported',
      ).toEqual([]);
    });
  });
});
