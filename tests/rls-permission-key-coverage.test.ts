import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PERMISSIONS } from '../src/lib/permissions/registry';

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

const KNOWN_KEYS = new Set(PERMISSIONS.map((p) => p.key));

/**
 * Match every `app_auth.has_permission('<key>', ...)` invocation and capture
 * the first argument (the permission key). We only trust the literal-string
 * form — dynamic keys built via `||` or variables cannot be statically
 * validated and would be a code smell anyway (RLS policy keys should be
 * hard-coded).
 */
const HAS_PERMISSION_RE =
  /\bapp_auth\.has_permission\s*\(\s*'([a-z_][a-z0-9_.]*)'/gi;

/**
 * Match any call that *looks* like a `has_permission` helper but is missing
 * the `app_auth.` schema prefix — a copy-paste bug that Postgres would
 * happily execute against `public.has_permission` (which does not exist,
 * yielding a runtime error at policy evaluation time) or, worse, another
 * function with the same name in a shadowing schema.
 */
const UNQUALIFIED_HAS_PERMISSION_RE =
  /(?<!\.)\bhas_permission\s*\(/gi;

interface PermissionRef {
  key: string;
  file: string;
  line: number;
}

function lineOf(sql: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < sql.length; i++) {
    if (sql[i] === '\n') line++;
  }
  return line;
}

const REFS: PermissionRef[] = [];
for (const { file, sql } of MIGRATIONS) {
  let m: RegExpExecArray | null;
  const re = new RegExp(HAS_PERMISSION_RE.source, HAS_PERMISSION_RE.flags);
  while ((m = re.exec(sql))) {
    REFS.push({ key: m[1]!, file, line: lineOf(sql, m.index) });
  }
}

/** Unique key → first-seen ref. */
const UNIQUE = new Map<string, PermissionRef>();
for (const r of REFS) {
  if (!UNIQUE.has(r.key)) UNIQUE.set(r.key, r);
}

describe('RLS policies reference only registered permission keys', () => {
  describe('sanity: extractors found something', () => {
    it('scanner discovered app_auth.has_permission(...) calls', () => {
      expect(REFS.length).toBeGreaterThan(0);
    });
    it('permission registry is non-empty', () => {
      expect(KNOWN_KEYS.size).toBeGreaterThan(0);
    });
  });

  describe('every referenced permission key is registered', () => {
    for (const [key, ref] of [...UNIQUE.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      it(`key "${key}" (first used in ${ref.file}:${ref.line}) is defined in PERMISSIONS`, () => {
        expect(
          KNOWN_KEYS.has(key),
          `Migration ${ref.file}:${ref.line} calls app_auth.has_permission('${key}', ...) but "${key}" is not in src/lib/permissions/registry.ts. app_auth.has_permission returns false for unknown keys — every RLS check on this key silently denies access, users see an empty result set. Either add the key to PERMISSIONS or fix the typo in the migration.`,
        ).toBe(true);
      });
    }
  });

  describe('no migration calls has_permission without the app_auth. schema prefix', () => {
    it('every has_permission(...) invocation is schema-qualified as app_auth.has_permission(...)', () => {
      const offenders: string[] = [];
      for (const { file, sql } of MIGRATIONS) {
        const re = new RegExp(
          UNQUALIFIED_HAS_PERMISSION_RE.source,
          UNQUALIFIED_HAS_PERMISSION_RE.flags,
        );
        let m: RegExpExecArray | null;
        while ((m = re.exec(sql))) {
          offenders.push(`  ${file}:${lineOf(sql, m.index)}: bare "has_permission(" — should be "app_auth.has_permission("`);
        }
      }
      expect(
        offenders,
        `Found unqualified has_permission(...) call(s):\n${offenders.join('\n')}\nEvery invocation must be schema-qualified as app_auth.has_permission(...). A bare call resolves via search_path and can hit an unintended function (or none), which is a security-relevant misconfiguration.`,
      ).toEqual([]);
    });
  });
});
