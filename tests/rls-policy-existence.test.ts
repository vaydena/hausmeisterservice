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

const CREATE_TABLE_RE =
  /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_.]*)\s*\(/gi;

const RLS_TOGGLE_RE =
  /\balter\s+table\s+(?:if\s+exists\s+)?([a-z_][a-z0-9_.]*)\s+(enable|disable)\s+row\s+level\s+security\b/gi;

/**
 * Postgres accepts both quoted (`"name"`) and unquoted (`name`) policy
 * identifiers. Both are used in our migrations.
 */
const CREATE_POLICY_RE =
  /\bcreate\s+policy\s+(?:"[^"]+"|[a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_.]*)/gi;

/**
 * Normalize an identifier to a bare public-schema name, or return null for
 * anything outside `public.*` (auth.*, storage.*, …).
 */
function publicTableName(qualified: string): string | null {
  const parts = qualified.toLowerCase().split('.');
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2 && parts[0] === 'public') return parts[1]!;
  return null;
}

interface RlsStatement {
  name: string;
  action: 'enable' | 'disable';
  file: string;
}
interface PolicyRef {
  table: string;
  file: string;
}

const CREATED = new Map<string, string>();
const RLS_STATEMENTS: RlsStatement[] = [];
const POLICIES: PolicyRef[] = [];

for (const { file, sql } of MIGRATIONS) {
  for (const m of sql.matchAll(CREATE_TABLE_RE)) {
    const name = publicTableName(m[1]!);
    if (!name) continue;
    if (!CREATED.has(name)) CREATED.set(name, file);
  }
  for (const m of sql.matchAll(RLS_TOGGLE_RE)) {
    const name = publicTableName(m[1]!);
    if (!name) continue;
    RLS_STATEMENTS.push({
      name,
      action: m[2]!.toLowerCase() as 'enable' | 'disable',
      file,
    });
  }
  for (const m of sql.matchAll(CREATE_POLICY_RE)) {
    const name = publicTableName(m[1]!);
    if (!name) continue;
    POLICIES.push({ table: name, file });
  }
}

function finalRlsState(table: string): 'enabled' | 'disabled' | 'never-set' {
  const relevant = RLS_STATEMENTS.filter((r) => r.name === table).sort((a, b) =>
    a.file.localeCompare(b.file),
  );
  if (relevant.length === 0) return 'never-set';
  return relevant[relevant.length - 1]!.action === 'enable' ? 'enabled' : 'disabled';
}

const POLICIES_BY_TABLE = new Map<string, PolicyRef[]>();
for (const p of POLICIES) {
  const list = POLICIES_BY_TABLE.get(p.table) ?? [];
  list.push(p);
  POLICIES_BY_TABLE.set(p.table, list);
}

/**
 * Tables that have RLS enabled but where the app deliberately never uses the
 * user-facing supabase client (only service_role writes via triggers, cron,
 * or edge functions). Deny-all is the intended behavior. Empty today. Add
 * here only when there is a written rationale — the test also asserts stale
 * entries (once a policy appears the allowlist entry becomes an error).
 */
const INTENTIONALLY_DENY_ALL = new Set<string>([
  // public.auth_rate_limits:
  //   Rate-Limit-Zaehler fuer Auth-Endpoints (Sprint 20). Die Tabelle hat
  //   RLS enabled aber keine Policy — das ist Absicht: kein authenticated
  //   oder anon User darf jemals lesen oder schreiben, weder auf eigene
  //   noch fremde Zaehler. Der Zugriff laeuft ausschliesslich ueber die
  //   drei SECURITY DEFINER Functions (check_and_consume_auth_rate_limit,
  //   reset_auth_rate_limit, cleanup_expired_auth_rate_limits) mit
  //   execute-Grant nur an service_role. Eine Policy waere daher nicht nur
  //   ueberfluessig, sondern eine Schwachstelle — sie wuerde einen Angreifer
  //   in die Lage versetzen, den eigenen Zaehler zu resetten und damit
  //   das Rate-Limit zu umgehen.
  'auth_rate_limits',
  // public.auth_mfa_recovery_codes:
  //   MFA-Recovery-Codes (Sprint 26). RLS deny-all aus demselben Grund
  //   wie auth_rate_limits: der User darf nicht mal die eigenen Hashes
  //   sehen, sonst koennte er per Bruteforce offline vermeintlich
  //   invalidierte Codes zurueckrechnen. Zugriff ausschliesslich ueber
  //   die drei SECURITY DEFINER Functions (generate_mfa_recovery_codes_
  //   for_user, consume_mfa_recovery_code, count_unused_mfa_recovery_codes)
  //   mit execute-Grant nur an service_role. Eine Policy waere ein
  //   Sicherheitsrisiko.
  'auth_mfa_recovery_codes',
]);

describe('RLS policy existence for every RLS-enabled public.* table', () => {
  describe('sanity: extractors found something', () => {
    it('scanner discovered CREATE TABLE statements', () => {
      expect(CREATED.size).toBeGreaterThan(0);
    });
    it('scanner discovered ENABLE ROW LEVEL SECURITY statements', () => {
      expect(RLS_STATEMENTS.filter((r) => r.action === 'enable').length).toBeGreaterThan(0);
    });
    it('scanner discovered CREATE POLICY statements', () => {
      expect(POLICIES.length).toBeGreaterThan(0);
    });
  });

  describe('every table with RLS enabled has at least one policy', () => {
    for (const [name, firstFile] of [...CREATED.entries()].sort()) {
      if (finalRlsState(name) !== 'enabled') continue;
      it(`table "public.${name}" (first declared in ${firstFile}) has at least one CREATE POLICY`, () => {
        const list = POLICIES_BY_TABLE.get(name) ?? [];
        if (INTENTIONALLY_DENY_ALL.has(name)) {
          expect(
            list,
            `"${name}" is in INTENTIONALLY_DENY_ALL but a policy now exists in the migrations. Remove the allowlist entry so this table is guarded again.`,
          ).toEqual([]);
          return;
        }
        expect(
          list.length,
          `public.${name} was declared in ${firstFile} with RLS enabled, but no migration contains "create policy … on public.${name}" (or bare "${name}"). RLS + zero policies = deny-all — every user's query on this table returns an empty result set. Add at least one policy, or (only with rationale) add "${name}" to INTENTIONALLY_DENY_ALL.`,
        ).toBeGreaterThan(0);
      });
    }
  });
});
