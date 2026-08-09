import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/** Strip -- line comments and block comments so regex only hits real SQL. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => ({
    file: f,
    sql: stripSqlComments(readFileSync(join(MIGRATIONS_DIR, f), 'utf8')),
  }));

/**
 * Capture the header of every `create or replace function schema.name(...)`
 * up to (but not including) the opening dollar-quoted body. group 1 = schema,
 * group 2 = name, group 3 = header text between `function` and `as $tag$`.
 * We only inspect the header — that is where `SET search_path = ''` must
 * appear so it applies to every invocation regardless of session state.
 */
const CREATE_FUNCTION_RE =
  /\bcreate\s+or\s+replace\s+function\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s+returns\s+([\s\S]*?)\bas\s+\$[a-z_]*\$/gi;

interface FnDecl {
  schema: string;
  name: string;
  header: string;
  file: string;
  hasSearchPath: boolean;
}

const DECLS: FnDecl[] = [];
for (const { file, sql } of MIGRATIONS) {
  const re = new RegExp(CREATE_FUNCTION_RE.source, CREATE_FUNCTION_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const schema = m[1]!.toLowerCase();
    const name = m[2]!.toLowerCase();
    const args = m[3]!;
    const returnsAndOptions = m[4]!;
    const header = `${args} returns ${returnsAndOptions}`;
    DECLS.push({
      schema,
      name,
      header,
      file,
      hasSearchPath: /\bset\s+search_path\s*(?:=|to)\s*['"]?/i.test(header),
    });
  }
}

/**
 * Only `app_auth.*` and `public.*` functions are ours. `auth.*`, `storage.*`,
 * `pgsodium.*`, `extensions.*` etc. are Supabase- or extension-managed and
 * outside the scope of this repo.
 */
const OWNED = DECLS.filter((d) => d.schema === 'app_auth' || d.schema === 'public');

/**
 * Last-write-wins per `schema.name` (chronological by filename). This mirrors
 * how Postgres resolves `create or replace function` — the last declaration
 * wins, so a later "harden" migration can fix an earlier oversight.
 * (We intentionally do NOT distinguish overloads by argument type here — if
 * the same schema.name is redeclared, we treat the last one as authoritative.
 * Overloads with different signatures on the same name are rare and would
 * warrant a manual review anyway.)
 */
const FINAL_DECL = new Map<string, FnDecl>();
for (const d of OWNED) {
  FINAL_DECL.set(`${d.schema}.${d.name}`, d);
}

/**
 * Functions whose final declaration deliberately omits `set search_path`.
 * Empty today. Add here only with a written rationale — the test also asserts
 * stale entries (once search_path appears, the allowlist entry becomes an
 * error).
 */
const INTENTIONALLY_MUTABLE = new Set<string>([]);

describe('Function search_path coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered at least one create-function statement', () => {
      expect(DECLS.length).toBeGreaterThan(0);
    });
    it('scanner discovered at least one owned (app_auth.* / public.*) function', () => {
      expect(FINAL_DECL.size).toBeGreaterThan(0);
    });
  });

  describe('every owned function pins its search_path in the header', () => {
    for (const [qualified, decl] of [...FINAL_DECL.entries()].sort()) {
      it(`function "${qualified}" (last declared in ${decl.file}) sets search_path in its header`, () => {
        if (INTENTIONALLY_MUTABLE.has(qualified)) {
          expect(
            decl.hasSearchPath,
            `"${qualified}" is in INTENTIONALLY_MUTABLE but now sets search_path. Remove the allowlist entry so the guard applies again.`,
          ).toBe(false);
          return;
        }
        expect(
          decl.hasSearchPath,
          `Function ${qualified} (in ${decl.file}) does not set "SET search_path = ''" (or a fixed value) in its header. Without a pinned search_path, a caller can shadow objects via CREATE ... IN pg_temp — for a SECURITY DEFINER helper this is a privilege-escalation surface (see the Supabase "function_search_path_mutable" advisor). Add "SET search_path = ''" between the RETURNS clause and the AS $$ body, then requalify every table/type reference inside the body (e.g. "public.memberships" instead of bare "memberships"). If this is a follow-up migration that only re-declares an earlier function to add the pin, make sure the newest declaration includes it — the last CREATE OR REPLACE wins.`,
        ).toBe(true);
      });
    }
  });
});
