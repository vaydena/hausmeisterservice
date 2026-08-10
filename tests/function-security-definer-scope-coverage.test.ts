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
 * Walk each `create [or replace] function ...` from its start through the
 * matching dollar-quoted body terminator `$$;` (or a tagged variant like
 * `$fn$...$fn$;`). We need to bound the statement precisely so a `security
 * definer` string inside a function body (comment, or a nested CREATE
 * FUNCTION generated via EXECUTE) doesn't bleed into the enclosing
 * function's classification.
 */
function extractFunctionStatements(sql: string): string[] {
  const out: string[] = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const start = m.index;
    const rest = sql.slice(start);
    const dollarTag = rest.match(/\$([a-z_]*)\$/i);
    let end = -1;
    if (dollarTag) {
      const tag = dollarTag[0];
      const openIdx = rest.indexOf(tag);
      const closeIdx = rest.indexOf(tag, openIdx + tag.length);
      if (closeIdx !== -1) {
        const semiIdx = rest.indexOf(';', closeIdx);
        if (semiIdx !== -1) end = start + semiIdx;
      }
    }
    if (end === -1) {
      const semiIdx = rest.indexOf(';');
      if (semiIdx !== -1) end = start + semiIdx;
    }
    if (end !== -1) out.push(sql.slice(start, end + 1));
  }
  return out;
}

const NAME_RE = /create\s+(?:or\s+replace\s+)?function\s+([a-z_.][a-z0-9_.]*)\s*\(/i;
const SECURITY_DEFINER_RE = /\bsecurity\s+definer\b/i;

interface FnDef {
  file: string;
  qualifiedName: string;
  schema: string;
  hasDefiner: boolean;
}

const ALL_FUNCTIONS: FnDef[] = [];
for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  for (const stmt of extractFunctionStatements(sql)) {
    const nm = stmt.match(NAME_RE);
    if (!nm) continue;
    const qualifiedName = nm[1]!.toLowerCase();
    const schema = qualifiedName.includes('.') ? qualifiedName.split('.')[0]! : '<implicit>';
    ALL_FUNCTIONS.push({
      file,
      qualifiedName,
      schema,
      hasDefiner: SECURITY_DEFINER_RE.test(stmt),
    });
  }
}

const DEFINER_FUNCTIONS = ALL_FUNCTIONS.filter((f) => f.hasDefiner);

/**
 * Schema prefix(es) where `security definer` is the intended pattern. We
 * scope this narrowly to `app_auth.*` — that schema is our conventional
 * "privileged helper" namespace: it holds trigger-support functions,
 * code-generators, notification-enqueue helpers and other utilities that
 * legitimately need to bypass RLS because they run on behalf of the
 * whole app, not on behalf of a specific caller. It is NOT exposed via
 * PostgREST (the API-facing schema is `public`), which is what makes
 * `security definer` safe there — a definer function in `app_auth.*` can
 * only be reached via triggers, other functions, or explicit
 * `select app_auth.foo(...)` from server-side code with the service
 * role, never from an unauthenticated HTTP caller.
 */
const ALLOWED_DEFINER_SCHEMAS = new Set<string>(['app_auth']);

/**
 * Explicit exceptions: individual `<schema>.<function>` names that need
 * `security definer` outside of `app_auth.*`. Each entry must justify
 * why it can't live in `app_auth.*` (typically: it needs to be exposed
 * as a PostgREST-callable RPC, so it MUST be in the `public` schema)
 * AND confirm what protects it from misuse (typically: an auth-scoped
 * `where` predicate on `auth.uid()` inside the function body).
 *
 *  - (none currently)
 *
 * Adding an entry here is a security-review moment: `public.*` +
 * `security definer` is exposed to every authenticated caller via
 * PostgREST as an RPC, running with owner (typically `postgres`)
 * privileges. If the function body doesn't itself filter on
 * `auth.uid()` or a similar caller-derived predicate, it is a
 * cross-tenant data exposure primitive.
 */
const INTENTIONALLY_DEFINER_OUTSIDE_APP_AUTH = new Set<string>([]);

describe('Function security-definer scope coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many function definitions', () => {
      expect(ALL_FUNCTIONS.length).toBeGreaterThan(20);
    });
    it('scanner discovered many security-definer functions', () => {
      expect(DEFINER_FUNCTIONS.length).toBeGreaterThan(20);
    });
  });

  describe('every security-definer function lives in an allowed schema', () => {
    for (const fn of DEFINER_FUNCTIONS.slice().sort((a, b) =>
      a.qualifiedName.localeCompare(b.qualifiedName),
    )) {
      it(`${fn.qualifiedName} (defined in ${fn.file}) is in an allowed definer schema`, () => {
        if (INTENTIONALLY_DEFINER_OUTSIDE_APP_AUTH.has(fn.qualifiedName)) {
          expect(
            ALLOWED_DEFINER_SCHEMAS.has(fn.schema),
            `${fn.qualifiedName} is on INTENTIONALLY_DEFINER_OUTSIDE_APP_AUTH but its schema (${fn.schema}) is now in ALLOWED_DEFINER_SCHEMAS. The exception is redundant — delete the entry.`,
          ).toBe(false);
          return;
        }
        expect(
          ALLOWED_DEFINER_SCHEMAS.has(fn.schema),
          `Function ${fn.qualifiedName} (defined in ${fn.file}) uses \`security definer\` but lives in schema "${fn.schema}", not one of the allowed definer schemas {${[...ALLOWED_DEFINER_SCHEMAS].join(', ')}}. This is dangerous because \`security definer\` makes the function run with the owner's privileges (typically \`postgres\`, which bypasses every RLS policy on every table), and any function in the \`public\` schema is exposed via PostgREST as an RPC callable by every authenticated user. Two ways forward: (1) move the function to \`app_auth.*\` if it is an internal helper (trigger support, code generator, notification enqueue — anything that shouldn't be directly callable from the client) and update every caller. (2) If the function genuinely must be a PostgREST-callable RPC (rare — most cross-tenant queries belong in server actions, not RPCs), add "${fn.qualifiedName}" to INTENTIONALLY_DEFINER_OUTSIDE_APP_AUTH with a written rationale explaining WHY it must be RPC-exposed AND confirming the function body itself filters on \`auth.uid()\` or an equivalent caller-derived predicate so it can't be turned into a cross-tenant read primitive.`,
        ).toBe(true);
      });
    }
  });

  describe('INTENTIONALLY_DEFINER_OUTSIDE_APP_AUTH entries stay stale-relevant', () => {
    it('every entry still matches a definer function outside the allowed schemas', () => {
      // Kept as a single test (not a per-entry loop) so it still runs
      // when the allowlist is empty — vitest fails the whole suite if a
      // describe() block has zero `it()` calls.
      const errors: string[] = [];
      for (const name of INTENTIONALLY_DEFINER_OUTSIDE_APP_AUTH) {
        const hit = DEFINER_FUNCTIONS.find((f) => f.qualifiedName === name);
        if (!hit) {
          errors.push(
            `INTENTIONALLY_DEFINER_OUTSIDE_APP_AUTH contains "${name}" but no such definer function exists in supabase/migrations/ anymore. Either the function was renamed, moved to app_auth.*, or lost its \`security definer\` designation. Delete the allowlist entry.`,
          );
          continue;
        }
        if (ALLOWED_DEFINER_SCHEMAS.has(hit.schema)) {
          errors.push(
            `Allowlist entry "${name}" is now in schema "${hit.schema}" which IS on the allowed definer schemas — the exception is redundant. Delete the entry.`,
          );
        }
      }
      expect(errors, errors.join('\n')).toEqual([]);
    });
  });
});
