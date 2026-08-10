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
 * Walk a `create policy ...` statement up to the semicolon that closes it,
 * respecting parenthesis depth and single-quoted string literals so a `;`
 * inside a policy body or literal does not cut the statement short.
 */
function extractPolicyStatements(sql: string): string[] {
  const out: string[] = [];
  const re = /create\s+policy\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const start = m.index;
    let depth = 0;
    let end = -1;
    for (let i = start; i < sql.length; i++) {
      const c = sql[i];
      if (c === "'") {
        i++;
        while (i < sql.length && sql[i] !== "'") i++;
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ';' && depth === 0) {
        end = i;
        break;
      }
    }
    if (end !== -1) out.push(sql.slice(start, end + 1));
  }
  return out;
}

/**
 * Extract the raw text inside the parens of a `USING (...)` or
 * `WITH CHECK (...)` clause. Returns null if the clause is absent.
 * Paren-depth tracked; single-quoted string literals skipped.
 */
function extractClause(stmt: string, keyword: string): string | null {
  const re = new RegExp('\\b' + keyword.replace(/\s+/g, '\\s+') + '\\s*\\(', 'i');
  const m = stmt.match(re);
  if (!m || m.index === undefined) return null;
  const start = m.index + m[0].length;
  let depth = 1;
  for (let i = start; i < stmt.length; i++) {
    const c = stmt[i];
    if (c === "'") {
      i++;
      while (i < stmt.length && stmt[i] !== "'") i++;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return stmt.slice(start, i).trim();
    }
  }
  return null;
}

const POLICY_HEADER_RE =
  /create\s+policy\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+on\s+([a-z_][a-z0-9_.]*)/i;

interface ParsedPolicy {
  file: string;
  name: string;
  table: string;
  using: string | null;
  check: string | null;
}

function parseAll(): ParsedPolicy[] {
  const out: ParsedPolicy[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    for (const stmt of extractPolicyStatements(sql)) {
      const hm = stmt.match(POLICY_HEADER_RE);
      const name = hm ? (hm[1] ?? hm[2] ?? '?') : '?';
      const table = hm ? (hm[3] ?? '?').toLowerCase() : '?';
      out.push({
        file,
        name,
        table,
        using: extractClause(stmt, 'using'),
        check: extractClause(stmt, 'with\\s+check'),
      });
    }
  }
  return out;
}

const ALL_POLICIES = parseAll();

function normalizeBody(body: string | null): string | null {
  if (body === null) return null;
  return body.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * A clause is trivial if it is exactly the literal `true`. Postgres treats
 * a `USING (true)` policy as "match every row for the operation" — no
 * restriction whatsoever. Combined with `FOR SELECT` that means the
 * policy makes every row visible to every authenticated caller within the
 * schema's grant scope; combined with `FOR ALL` it makes every row
 * readable/writable/deletable.
 *
 * We treat WITH CHECK (true) the same way (INSERT/UPDATE writes: no
 * restriction), but in practice WITH CHECK is usually paired with a
 * matching USING and the trivial-USING case is what catches the
 * fail-open policies at PR-review time.
 */
function isTrivialTrue(body: string | null): boolean {
  return normalizeBody(body) === 'true';
}

function policyKey(p: ParsedPolicy): string {
  return `${p.file}::${p.name}::${p.table}`;
}

/**
 * Policies whose USING or WITH CHECK is intentionally trivial-true. Every
 * entry must justify WHY the table has no per-row restriction and confirm
 * that the operation shape (grant to authenticated / anon / etc.) is not
 * a data-leakage risk.
 *
 *  - `20260801000000_init.sql::permissions_select::public.permissions`:
 *    `public.permissions` is the static, project-wide permission catalog
 *    (list of every registered permission key like `work_orders.create`).
 *    It is NOT tenant-scoped — every authenticated caller needs to be
 *    able to read the full catalog to render role-management UIs and to
 *    resolve their own permission set. There is no INSERT/UPDATE/DELETE
 *    policy (only the seed script writes it via the service role), so
 *    the `USING (true)` on SELECT is the intended "world-readable within
 *    the app" shape.
 *
 * The test asserts entries stay stale-relevant: if any of these policies
 * ever gains a non-trivial USING/WITH CHECK, the allowlist entry becomes
 * an error and forces removal (so we don't accumulate dead noise).
 */
const INTENTIONALLY_OPEN_POLICIES = new Set<string>([
  '20260801000000_init.sql::permissions_select::public.permissions',
]);

const TRIVIAL_POLICIES = ALL_POLICIES.filter(
  (p) => isTrivialTrue(p.using) || isTrivialTrue(p.check),
);

describe('RLS policy non-trivial clause coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner parsed many policies', () => {
      expect(ALL_POLICIES.length).toBeGreaterThan(100);
    });
    it('every parsed policy has at least one clause (USING or WITH CHECK)', () => {
      // A `create policy` with NEITHER clause defaults per Postgres to a
      // shape that varies by operation (`FOR SELECT` gets `USING (true)`
      // implicitly, etc.). To keep our reasoning explicit, every policy
      // must SPELL the clause out — even if the intent is trivial-true.
      const neither = ALL_POLICIES.filter((p) => p.using === null && p.check === null);
      expect(
        neither,
        neither.length > 0
          ? `The following policies have no USING and no WITH CHECK clause — Postgres will apply an implicit default that depends on the FOR-operation and is easy to misread:\n${neither
              .map((p) => `  ${p.file}: "${p.name}" on ${p.table}`)
              .join(
                '\n',
              )}\nAdd an explicit clause. If the intent is truly "no restriction", write \`USING (true)\` or \`WITH CHECK (true)\` and add the policy to INTENTIONALLY_OPEN_POLICIES with a rationale.`
          : 'unexpected — extractor produced clause-less policies when none exist',
      ).toEqual([]);
    });
  });

  describe('every trivial-true policy is on the intentionally-open allowlist', () => {
    it('the set of trivial policies exactly matches the allowlist', () => {
      const actualTrivial = new Set(TRIVIAL_POLICIES.map(policyKey));
      const missing = [...actualTrivial].filter((k) => !INTENTIONALLY_OPEN_POLICIES.has(k));
      const stale = [...INTENTIONALLY_OPEN_POLICIES].filter((k) => !actualTrivial.has(k));
      expect(
        { missing, stale },
        [
          missing.length > 0
            ? `\nThese policies have a trivial USING (true) or WITH CHECK (true) but are NOT on INTENTIONALLY_OPEN_POLICIES:\n${missing.map((k) => `  ${k}`).join('\n')}\n\nA policy with \`USING (true)\` places no per-row restriction on reads/updates/deletes — combined with the schema's grant to authenticated (which we do for every tenant-scoped table), every authenticated caller sees every row across every tenant. That is the most severe RLS failure mode: the migration applies without error, RLS is "enabled" and "has policies", the row count in Supabase Studio shows normal per-tenant counts to admins (because admins see everything anyway), but a cross-tenant test would return every row. Fix the policy so its USING/WITH CHECK actually restricts by tenant_id (or the appropriate scope), OR — if the table genuinely has no scope (like a global catalog) — add the key above to INTENTIONALLY_OPEN_POLICIES with a written rationale explaining WHY the table has no per-row restriction and confirming the grant scope is not a data-leakage risk.`
            : '',
          stale.length > 0
            ? `\nThese entries are on INTENTIONALLY_OPEN_POLICIES but no longer match any trivial-true policy in the migrations:\n${stale.map((k) => `  ${k}`).join('\n')}\n\nEither the policy was tightened (now has a real predicate — great, delete the allowlist entry) or the policy/table was renamed or removed (delete the allowlist entry). Allowlist entries that don't match reality are dead weight.`
            : '',
        ]
          .join('')
          .trim() || 'unexpected — sets diverged but no differences reported',
      ).toEqual({ missing: [], stale: [] });
    });
  });

  describe('every intentionally-open allowlist entry still exists and is still trivial-true', () => {
    for (const key of INTENTIONALLY_OPEN_POLICIES) {
      it(`allowlist entry "${key}" still matches a trivial-true policy`, () => {
        const hit = ALL_POLICIES.find((p) => policyKey(p) === key);
        expect(
          hit,
          `INTENTIONALLY_OPEN_POLICIES contains "${key}" but no such policy exists in supabase/migrations/ anymore. The file, policy name, or target table must have changed. Delete the allowlist entry or update it to the new key.`,
        ).toBeDefined();
        if (hit) {
          expect(
            isTrivialTrue(hit.using) || isTrivialTrue(hit.check),
            `Allowlist entry "${key}" was added because its USING or WITH CHECK was \`true\`, but the policy now has non-trivial clauses (USING: ${hit.using ?? 'null'}, WITH CHECK: ${hit.check ?? 'null'}). Delete the allowlist entry so this policy is guarded like any other.`,
          ).toBe(true);
        }
      });
    }
  });
});
