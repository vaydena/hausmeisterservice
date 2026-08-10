import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_DIR = join(process.cwd(), 'src');

function walkTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsx(abs));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
    ) {
      out.push(abs);
    }
  }
  return out;
}

/**
 * A file is a Server-Actions module iff `'use server'` sits at file scope.
 * Every export in such a file becomes a Server Action callable from any
 * client component, so the Supabase client it picks matters a lot: the
 * anon/cookie-backed `createSupabaseServerClient` enforces the caller's
 * RLS scope, while `createSupabaseServiceClient` bypasses RLS entirely
 * (service-role JWT). Mixing the wrong one gives every client caller
 * root DB access for the duration of that action's body.
 */
const USE_SERVER_RE = /^\s*['"]use server['"];?\s*$/m;

/**
 * Static import of the service-client factory from `@/lib/supabase/service`.
 * Handles both named-import (`import { createSupabaseServiceClient }`) and
 * default-import shapes, because either would pull the RLS-bypassing
 * factory into scope.
 */
const SERVICE_IMPORT_RE =
  /\bimport\s+(?:\{[^}]*\bcreateSupabaseServiceClient\b[^}]*\}|createSupabaseServiceClient)\s+from\s+['"][^'"]*supabase\/service['"]/;

/**
 * A direct call to the factory. Imports without calls (e.g. type-only
 * usage) would also be caught by the import regex, but we track calls
 * separately so the diagnostic can point at the concrete failure.
 */
const SERVICE_CALL_RE = /\bcreateSupabaseServiceClient\s*\(/;

interface ServerActionFile {
  file: string;
  hasServiceImport: boolean;
  hasServiceCall: boolean;
}

const ALL_SERVER_ACTION_FILES: ServerActionFile[] = walkTsx(SRC_DIR)
  .map((abs) => {
    const source = readFileSync(abs, 'utf8');
    return { abs, source };
  })
  .filter((x) => USE_SERVER_RE.test(x.source))
  .map((x) => {
    const file = relative(process.cwd(), x.abs).replace(/\\/g, '/');
    return {
      file,
      hasServiceImport: SERVICE_IMPORT_RE.test(x.source),
      hasServiceCall: SERVICE_CALL_RE.test(x.source),
    };
  })
  .sort((a, b) => a.file.localeCompare(b.file));

const SERVICE_CLIENT_USERS = ALL_SERVER_ACTION_FILES.filter(
  (f) => f.hasServiceImport || f.hasServiceCall,
);

/**
 * Server-Actions files that legitimately use the RLS-bypassing service
 * client. Each entry must justify WHY the action cannot use the normal
 * anon+cookie client, and every callsite in the file must be behind an
 * explicit permission check that lands BEFORE the service-client call.
 *
 *  - src/app/(app)/people/employees/actions.ts:
 *      Employee invite flow. Calls `auth.admin.inviteUserByEmail` and
 *      `auth.admin.listUsers`, both of which require the service-role JWT
 *      by Supabase Auth-Admin design. Gated by
 *      `perms.has('employees.create')` + `perms.has('core.users_roles.create')`
 *      before the service client is ever constructed.
 *
 *  - src/app/(app)/people/residents/actions.ts:
 *      Resident portal-invite flow. Same reason as above — Auth-Admin
 *      APIs need the service role. Gated by the resident-management
 *      permission check earlier in the function.
 *
 *  - src/app/(app)/settings/automations/actions.ts:
 *      Three service-client callsites: (1) DELETE on `automation_dispatches`,
 *      which has no user-facing DELETE policy because the table is engine-
 *      owned; (2) INSERT into `sent_emails`, which is only writable by the
 *      engine (service role); (3) invoking `runRule(service, ...)` for
 *      manual-trigger test-sends, since the engine expects a service
 *      client as its DB handle. All three are gated by the automations
 *      management permission plus a tenant-id match on the rule row
 *      fetched via the anon client first.
 *
 * The test asserts entries stay stale-relevant: if any of these files
 * ever stops importing/calling the service client, the allowlist entry
 * becomes an error and forces removal (so we don't accumulate dead
 * allowlist noise).
 */
const INTENTIONALLY_SERVICE_CLIENT_ACTIONS = new Set<string>([
  'src/app/(app)/people/employees/actions.ts',
  'src/app/(app)/people/residents/actions.ts',
  'src/app/(app)/settings/automations/actions.ts',
]);

describe('Server-Action service-client coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many "use server" files', () => {
      expect(ALL_SERVER_ACTION_FILES.length).toBeGreaterThan(10);
    });
    it('at least one server-action file uses the service client', () => {
      // If this collapses to 0, either the codebase legitimately dropped
      // every service-client callsite (great — then also delete the whole
      // allowlist and this guard becomes trivially green forever) or the
      // extractor regex broke. Either way this sanity check catches it
      // before per-file assertions look green trivially.
      expect(SERVICE_CLIENT_USERS.length).toBeGreaterThan(0);
    });
  });

  describe('every service-client user is on the explicit allowlist', () => {
    for (const f of SERVICE_CLIENT_USERS) {
      it(`${f.file} is in INTENTIONALLY_SERVICE_CLIENT_ACTIONS`, () => {
        expect(
          INTENTIONALLY_SERVICE_CLIENT_ACTIONS.has(f.file),
          `${f.file} is a Server-Actions module ("'use server'" at file scope) and imports or calls createSupabaseServiceClient. That factory returns a client authenticated with SUPABASE_SERVICE_ROLE_KEY, which bypasses every RLS policy on every table. Any client component can call the exported Server Actions in this file, so effectively the whole file runs with root DB privileges for the duration of each action's body. Two ways forward: (1) if the action doesn't actually need to bypass RLS (most don't), replace the service client with createSupabaseServerClient() from @/lib/supabase/server so RLS enforces the caller's tenant scope; (2) if the action genuinely needs the service role (Auth-Admin APIs like auth.admin.inviteUserByEmail, or writing to engine-owned tables like sent_emails / automation_dispatches that have no user-facing write policy), add "${f.file}" to INTENTIONALLY_SERVICE_CLIENT_ACTIONS with a written rationale explaining WHY the anon client won't work AND confirming every callsite is behind a permission check.`,
        ).toBe(true);
      });
    }
    for (const entry of INTENTIONALLY_SERVICE_CLIENT_ACTIONS) {
      it(`allowlist entry "${entry}" still exists and still uses the service client`, () => {
        expect(
          existsSync(join(process.cwd(), entry)),
          `INTENTIONALLY_SERVICE_CLIENT_ACTIONS contains "${entry}" but that file no longer exists. Delete the allowlist entry.`,
        ).toBe(true);
        const hit = ALL_SERVER_ACTION_FILES.find((x) => x.file === entry);
        expect(
          hit,
          `INTENTIONALLY_SERVICE_CLIENT_ACTIONS contains "${entry}" but the file no longer has "'use server'" at file scope. Either it stopped being a Server-Actions module (delete the allowlist entry) or the directive was moved (find the new file and update the entry).`,
        ).toBeDefined();
        expect(
          hit?.hasServiceImport || hit?.hasServiceCall,
          `Allowlist entry "${entry}" was added because it imported/called createSupabaseServiceClient, but it no longer does. Delete the allowlist entry so this file is guarded like any other Server-Actions module.`,
        ).toBe(true);
      });
    }
  });
});
