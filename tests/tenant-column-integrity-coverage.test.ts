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

const CONSTRAINT_LEAD_RE =
  /^(constraint|primary\s+key|unique|check|foreign\s+key|exclude|like)\b/i;
const TENANT_FK_RE = /\breferences\s+(?:public\.)?tenants\s*\(\s*id\s*\)/i;
const NOT_NULL_RE = /\bnot\s+null\b/i;
const PRIMARY_KEY_INLINE_RE = /\bprimary\s+key\b/i;
const ON_DELETE_CASCADE_RE = /\bon\s+delete\s+cascade\b/i;
const ON_DELETE_ANY_RE = /\bon\s+delete\s+(cascade|restrict|no\s+action|set\s+null|set\s+default)\b/i;

interface TenantFkColumn {
  file: string;
  table: string;
  colName: string;
  entry: string;
  hasNotNull: boolean;
  hasInlinePrimaryKey: boolean;
  isInTablePrimaryKey: boolean;
  hasOnDeleteCascade: boolean;
  onDeleteAction: string | null;
}

function collectTenantFkColumns(): TenantFkColumn[] {
  const out: TenantFkColumn[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    for (const { table, body } of extractCreateTable(sql)) {
      // Find table-level PRIMARY KEY constraint columns (composite PK case)
      const tablePkCols = new Set<string>();
      for (const rawEntry of splitColumns(body)) {
        const entry = rawEntry.replace(/\s+/g, ' ').trim();
        if (!CONSTRAINT_LEAD_RE.test(entry)) continue;
        if (!PRIMARY_KEY_INLINE_RE.test(entry)) continue;
        const pkMatch = entry.match(/primary\s+key\s*\(([^)]+)\)/i);
        if (pkMatch) {
          for (const c of pkMatch[1]!.split(',')) {
            tablePkCols.add(c.trim().toLowerCase());
          }
        }
      }
      for (const rawEntry of splitColumns(body)) {
        const entry = rawEntry.replace(/\s+/g, ' ').trim();
        if (!entry) continue;
        if (CONSTRAINT_LEAD_RE.test(entry)) continue;
        const nm = entry.match(/^([a-z_][a-z0-9_]*)\b/i);
        if (!nm) continue;
        const colName = nm[1]!.toLowerCase();
        if (!TENANT_FK_RE.test(entry)) continue;
        const onDeleteMatch = entry.match(ON_DELETE_ANY_RE);
        out.push({
          file,
          table,
          colName,
          entry,
          hasNotNull: NOT_NULL_RE.test(entry),
          hasInlinePrimaryKey: PRIMARY_KEY_INLINE_RE.test(entry),
          isInTablePrimaryKey: tablePkCols.has(colName),
          hasOnDeleteCascade: ON_DELETE_CASCADE_RE.test(entry),
          onDeleteAction: onDeleteMatch
            ? onDeleteMatch[1]!.toLowerCase().replace(/\s+/g, ' ')
            : null,
        });
      }
    }
  }
  return out;
}

const TENANT_FK_COLUMNS = collectTenantFkColumns();

describe('Tenant-column integrity coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many tenant-FK columns', () => {
      expect(TENANT_FK_COLUMNS.length).toBeGreaterThan(20);
    });
    it('all tenant-FK columns are canonically named `tenant_id`', () => {
      // Naming is enforced by tenant-column-naming-consistency-coverage
      // (batch 30). Repeat the invariant here as a load-bearing precondition
      // for the checks below — they all target `tenant_id` semantics.
      const misnamed = TENANT_FK_COLUMNS.filter((c) => c.colName !== 'tenant_id');
      expect(
        misnamed,
        misnamed.length > 0
          ? `Tenant-FK columns with non-canonical names: ${misnamed
              .map((c) => `${c.file}::${c.table}.${c.colName}`)
              .join(', ')}`
          : 'unexpected — misnamed reported but list empty',
      ).toEqual([]);
    });
  });

  /**
   * Rule 1: NOT NULL is mandatory. A nullable `tenant_id` is a
   * catastrophic RLS-bypass primitive:
   *
   *   - RLS policies universally compare `tenant_id = current_tenant_id()`
   *     (via app_auth.current_tenant_id()). SQL uses three-valued logic:
   *     `NULL = <anything>` evaluates to NULL, not TRUE, so a row with
   *     `tenant_id = NULL` is INVISIBLE to any tenant's SELECT — which
   *     sounds "safe", but the app has no path to legitimately create such
   *     a row from user context, so its existence means someone/something
   *     inserted it out-of-band (a broken migration, a service-role
   *     script, an admin repair) and it's now dead data.
   *   - Worse, an INSERT/UPDATE policy with `WITH CHECK (tenant_id =
   *     current_tenant_id())` on a NULLABLE column will REJECT
   *     `tenant_id = NULL` writes (NULL != current_tenant_id() is NULL,
   *     not TRUE, and WITH CHECK requires TRUE) — but WITHOUT an INSERT
   *     policy at all (rare misconfiguration but possible), a NULL
   *     insert would slip through with no tenant restriction and later
   *     be filtered by NOTHING.
   *   - The one legitimate NULL-tenant_id case would be pre-tenant
   *     onboarding rows, but this app has no such flow — every domain
   *     entity is created in an authenticated tenant context.
   *
   * A column that is part of a PRIMARY KEY (either inline PRIMARY KEY or
   * a table-level composite PRIMARY KEY constraint) is implicitly NOT
   * NULL and passes this rule.
   */
  describe('every tenant-FK column is NOT NULL (explicitly or via PRIMARY KEY)', () => {
    for (const c of TENANT_FK_COLUMNS.slice().sort((a, b) =>
      `${a.table}`.localeCompare(`${b.table}`),
    )) {
      it(`${c.table}.${c.colName} (defined in ${c.file}) is NOT NULL`, () => {
        const isNonNull = c.hasNotNull || c.hasInlinePrimaryKey || c.isInTablePrimaryKey;
        expect(
          isNonNull,
          `${c.table}.${c.colName} in ${c.file} is a foreign key to public.tenants(id) but has NO \`not null\` constraint and is NOT part of a PRIMARY KEY. A nullable tenant_id is an RLS-bypass primitive: SQL three-valued logic means \`tenant_id = current_tenant_id()\` evaluates to NULL (not TRUE and not FALSE) for a NULL row, making the row invisible to normal tenant scoping — but the row exists, occupies storage, and can leak via any code path that bypasses RLS (service-role queries, cross-tenant admin views). The app has no legitimate pre-tenant onboarding flow; every row of a tenant-scoped table is created under an authenticated tenant context. Add \`not null\` to the column definition. Column entry: "${c.entry.slice(0, 150)}"`,
        ).toBe(true);
      });
    }
  });

  /**
   * Rule 2: ON DELETE CASCADE is mandatory. When a tenant is deleted,
   * every row of every tenant-scoped table MUST be deleted with it.
   * Other on-delete actions each have specific failure modes:
   *
   *   - `on delete restrict` / `on delete no action` (the SQL default):
   *     tenant deletion is blocked as soon as any tenant-scoped row
   *     exists. Since new tenants immediately accumulate rows (via seed,
   *     onboarding, first work order, etc.), tenant deletion becomes
   *     effectively impossible without a bespoke cleanup script.
   *   - `on delete set null`: the row survives but its tenant_id becomes
   *     NULL — which violates the NOT NULL rule above, so this
   *     combination would fail to apply as a migration anyway. If NOT
   *     NULL were relaxed for this reason, the resulting NULL-tenant
   *     rows would be the exact RLS-bypass primitive discussed above.
   *   - `on delete set default`: same problem as set null, plus it
   *     requires a default value that would need to be a real
   *     tenant_id — which is nonsensical for a per-tenant scope column.
   *
   * CASCADE is the only shape that expresses the actual invariant: a
   * tenant is the root of its data tree; deleting the root deletes the
   * tree.
   */
  describe('every tenant-FK column has ON DELETE CASCADE', () => {
    for (const c of TENANT_FK_COLUMNS.slice().sort((a, b) =>
      `${a.table}`.localeCompare(`${b.table}`),
    )) {
      it(`${c.table}.${c.colName} (defined in ${c.file}) has ON DELETE CASCADE`, () => {
        expect(
          c.hasOnDeleteCascade,
          `${c.table}.${c.colName} in ${c.file} is a foreign key to public.tenants(id) but ${
            c.onDeleteAction
              ? `declares \`on delete ${c.onDeleteAction}\` instead of \`on delete cascade\``
              : 'does NOT declare an explicit \`on delete\` action (Postgres defaults to \`no action\`, which blocks tenant deletion the moment any tenant-scoped row exists)'
          }. A tenant is the root of its entire data tree — deleting a tenant MUST delete the tree, otherwise (a) tenant deletion becomes impossible in practice, blocked by every child row, or (b) rows survive with a stale/NULL tenant_id and become RLS-bypass primitives. Change the column definition to include \`on delete cascade\`. Column entry: "${c.entry.slice(0, 150)}"`,
        ).toBe(true);
      });
    }
  });
});
