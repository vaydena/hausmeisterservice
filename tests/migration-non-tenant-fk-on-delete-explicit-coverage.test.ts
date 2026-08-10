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
const REFERENCES_RE = /\breferences\s+([a-z_][a-z0-9_.]*)\s*(?:\(\s*[a-z_][a-z0-9_]*\s*\))?/i;
const TENANT_FK_RE = /\breferences\s+(?:public\.)?tenants\s*\(\s*id\s*\)/i;
const ON_DELETE_ANY_RE =
  /\bon\s+delete\s+(cascade|restrict|no\s+action|set\s+null|set\s+default)\b/i;

interface Fk {
  file: string;
  table: string;
  colName: string;
  target: string;
  entry: string;
  hasExplicitOnDelete: boolean;
  onDeleteAction: string | null;
}

function collectNonTenantFks(): Fk[] {
  const out: Fk[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    for (const { table, body } of extractCreateTable(sql)) {
      for (const rawEntry of splitColumns(body)) {
        const entry = rawEntry.replace(/\s+/g, ' ').trim();
        if (!entry) continue;
        const refMatch = entry.match(REFERENCES_RE);
        if (!refMatch) continue;
        if (TENANT_FK_RE.test(entry)) continue; // covered by tenant-column-integrity-coverage (batch 31)
        const target = refMatch[1]!.toLowerCase();
        const isColumnEntry = !CONSTRAINT_LEAD_RE.test(entry);
        const nm = isColumnEntry ? entry.match(/^([a-z_][a-z0-9_]*)\b/i) : null;
        const colName = nm ? nm[1]!.toLowerCase() : '<table-constraint>';
        const onDeleteMatch = entry.match(ON_DELETE_ANY_RE);
        out.push({
          file,
          table,
          colName,
          target,
          entry,
          hasExplicitOnDelete: onDeleteMatch !== null,
          onDeleteAction: onDeleteMatch
            ? onDeleteMatch[1]!.toLowerCase().replace(/\s+/g, ' ')
            : null,
        });
      }
    }
  }
  return out;
}

const NON_TENANT_FKS = collectNonTenantFks();

/**
 * Grandfathered exceptions: FKs that already exist in a shipped
 * migration WITHOUT an explicit `on delete` clause. Rewriting a
 * shipped migration changes its checksum in the Supabase migration
 * ledger, which trips CI/deploy against any environment that has
 * already applied it. New migrations MUST NOT extend this list —
 * every future FK is required to declare an explicit `on delete`
 * action.
 *
 * Key format: `<file>::<table>.<column>` (or `.<table-constraint>`).
 * The key must be exact — a rename or a whitespace change
 * invalidates the entry, forcing a re-verification.
 */
const IMPLICIT_ON_DELETE_ALLOWLIST = new Set<string>([
  '20260801000000_init.sql::public.user_roles.created_by',
]);

describe('Non-tenant FK on-delete explicit coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many non-tenant FKs', () => {
      expect(NON_TENANT_FKS.length).toBeGreaterThan(100);
    });

    it('no scanned FK targets public.tenants (that scope belongs to batch 31)', () => {
      const bleed = NON_TENANT_FKS.filter((f) => TENANT_FK_RE.test(f.entry));
      expect(
        bleed,
        bleed.length > 0
          ? `tenant-FK columns leaked into the non-tenant guard: ${bleed
              .map((f) => `${f.file}::${f.table}.${f.colName}`)
              .join(', ')}`
          : 'unexpected — bleed reported but list empty',
      ).toEqual([]);
    });

    it('every explicit on-delete action is one of the five valid values', () => {
      const invalid = NON_TENANT_FKS.filter(
        (f) =>
          f.hasExplicitOnDelete &&
          !['cascade', 'restrict', 'no action', 'set null', 'set default'].includes(
            f.onDeleteAction!,
          ),
      );
      expect(
        invalid,
        invalid.length > 0
          ? `unexpected on-delete action values: ${invalid
              .map((f) => `${f.file}::${f.table}.${f.colName} → ${f.onDeleteAction}`)
              .join(', ')}`
          : 'unexpected — invalid reported but list empty',
      ).toEqual([]);
    });
  });

  /**
   * Rule: every non-tenant FK must declare an explicit `on delete`
   * action.
   *
   * Postgres defaults to `on delete no action` when nothing is
   * declared, which is a deferred `restrict` — parent deletion is
   * blocked if any child row exists. That's often the right answer,
   * but it's dangerous as a SILENT default: reading a column
   * definition without an `on delete` clause gives no signal about
   * what happens on delete, and a reader who was expecting
   * `cascade` (because "surrounding tables cascade") or `set null`
   * (because "audit columns null out") will guess wrong and
   * introduce subtle bugs — orphan rows that should have cascaded,
   * or blocked deletions that should have nulled out.
   *
   * The rule forces every FK author to state intent AT the site of
   * the column, which:
   *   1. Makes reviews specific ("why restrict here?" vs.
   *      "did they forget?").
   *   2. Prevents `no action` from being accidentally chosen when
   *      the author actually wanted `set null` or `cascade`.
   *   3. Surfaces divergence when a related table's FKs cascade but
   *      this one silently doesn't — grep for `on delete` and the
   *      answer is right there.
   *
   * Any of the five explicit actions (`cascade`, `restrict`,
   * `no action`, `set null`, `set default`) satisfies the rule.
   * The guard doesn't dictate WHICH action — that's a semantic
   * choice per column. It only requires that ONE be chosen and
   * declared.
   */
  describe('every non-tenant FK declares an explicit on-delete action', () => {
    for (const fk of NON_TENANT_FKS.slice().sort((a, b) =>
      `${a.file}::${a.table}.${a.colName}`.localeCompare(
        `${b.file}::${b.table}.${b.colName}`,
      ),
    )) {
      const key = `${fk.file}::${fk.table}.${fk.colName}`;
      it(`${fk.table}.${fk.colName} → ${fk.target} (in ${fk.file}) declares an on-delete action`, () => {
        if (IMPLICIT_ON_DELETE_ALLOWLIST.has(key)) {
          // Grandfathered: existing shipped migration; do not
          // regress into requiring on-delete here (would change
          // the migration checksum).
          expect(
            fk.hasExplicitOnDelete,
            `${key} is in the allowlist but now DOES have an explicit on-delete. Remove it from IMPLICIT_ON_DELETE_ALLOWLIST — the exemption is stale.`,
          ).toBe(false);
          return;
        }
        expect(
          fk.hasExplicitOnDelete,
          `${fk.table}.${fk.colName} in ${fk.file} references ${fk.target} but has NO explicit \`on delete\` clause. Postgres defaults to \`on delete no action\` (deferred restrict), which BLOCKS parent deletion the moment any child row exists — but nothing in the column definition says so. Readers who assumed \`cascade\` (because sibling tables cascade) or \`set null\` (because this looks like an audit column) will be surprised in production. Choose intentionally and declare it: \`on delete cascade\` if the child is dependent, \`on delete set null\` if the child should survive without the reference (requires the column to be nullable), \`on delete restrict\` / \`on delete no action\` if the parent should NEVER be deletable while this child exists. Column entry: "${fk.entry.slice(0, 150)}"`,
        ).toBe(true);
      });
    }
  });

  /**
   * Stale-entry check: catch allowlist bloat. Any allowlisted key
   * that no longer maps to a real FK (because the column was
   * renamed, the table was dropped, or the FK now HAS an explicit
   * on-delete and shouldn't be exempt anymore) is a hidden bug —
   * the exemption still exists but doesn't do anything, so future
   * regressions in this area sail past.
   */
  describe('IMPLICIT_ON_DELETE_ALLOWLIST is not stale', () => {
    it('every allowlist entry points to a real non-tenant FK', () => {
      const knownKeys = new Set(
        NON_TENANT_FKS.map((f) => `${f.file}::${f.table}.${f.colName}`),
      );
      const orphans = [...IMPLICIT_ON_DELETE_ALLOWLIST].filter((k) => !knownKeys.has(k));
      expect(
        orphans,
        orphans.length > 0
          ? `IMPLICIT_ON_DELETE_ALLOWLIST contains keys that no longer match any scanned non-tenant FK: ${orphans.join(
              ', ',
            )}. Either the FK was removed/renamed or the extractor no longer sees it; the allowlist entry is dead weight — remove it.`
          : 'unexpected — orphans reported but list empty',
      ).toEqual([]);
    });

    it('every allowlist entry is still missing an explicit on-delete (else the exemption is obsolete)', () => {
      const obsolete = [...IMPLICIT_ON_DELETE_ALLOWLIST].filter((k) => {
        const fk = NON_TENANT_FKS.find(
          (f) => `${f.file}::${f.table}.${f.colName}` === k,
        );
        return fk && fk.hasExplicitOnDelete;
      });
      expect(
        obsolete,
        obsolete.length > 0
          ? `IMPLICIT_ON_DELETE_ALLOWLIST contains keys whose FK now HAS an explicit on-delete action: ${obsolete.join(
              ', ',
            )}. The exemption is no longer needed — remove these entries so the guard actively covers them.`
          : 'unexpected — obsolete reported but list empty',
      ).toEqual([]);
    });
  });
});
