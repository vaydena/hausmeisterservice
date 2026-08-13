import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_DIR = join(process.cwd(), 'src');

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTs(abs));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(abs);
    }
  }
  return out;
}

/**
 * Top-level `'use server'` directive. Only files that put this at file scope
 * treat every export as a Server Action. Inline `'use server'` inside a
 * function body (used in Server Components) is out of scope — those actions
 * are not the load-bearing surface for auth coverage.
 */
const USE_SERVER_RE = /^\s*['"]use server['"];?\s*$/m;

/**
 * Recognized authentication gates. All three redirect to a safe page if no
 * matching membership exists, so calling any of them in an action's body
 * proves the anonymous case cannot slip past.
 *  - requireTenantContext   (src/lib/tenant/current.ts)   — app-side (staff/admin)
 *  - requireResidentContext (src/lib/portal/current.ts)   — portal-side (residents)
 *  - requirePlatformAdmin   (src/lib/platform/require-admin.ts)
 *      — /platform-side; even stricter than requireTenantContext because it
 *        additionally verifies platform.admins membership and redirects to
 *        /no-access when the current user is not a platform admin.
 * Once at least one is called anywhere in the file, we consider the file
 * "auth-guarded"; the guard is a floor, not a per-function proof (see below).
 */
const AUTH_CALL_RE =
  /\b(requireTenantContext|requireResidentContext|requirePlatformAdmin)\s*\(/;

interface ActionFile {
  file: string; // repo-relative, forward slashes
  source: string;
  hasAuthCall: boolean;
}

const ACTION_FILES: ActionFile[] = walkTs(SRC_DIR)
  .map((abs) => ({
    file: relative(process.cwd(), abs).replace(/\\/g, '/'),
    source: readFileSync(abs, 'utf8'),
  }))
  .filter((f) => USE_SERVER_RE.test(f.source))
  .map((f) => ({ ...f, hasAuthCall: AUTH_CALL_RE.test(f.source) }))
  .sort((a, b) => a.file.localeCompare(b.file));

/**
 * Files that legitimately export Server Actions without calling
 * requireTenantContext / requireResidentContext. These are the bootstrap
 * flows that RUN BEFORE a session exists — asking them to require a session
 * would be a chicken-and-egg deadlock.
 *
 * Rationale per entry:
 *  - src/app/(auth)/login/actions.ts: staff/admin sign-in. Runs pre-session.
 *  - src/app/(auth)/reset-password/actions.ts: forgotten-password reset link
 *    handler. Runs pre-session (user proves identity via the emailed token).
 *  - src/app/(portal)/portal/login/actions.ts: resident sign-in. Same as
 *    above but for the resident portal.
 *
 * The test asserts these entries stay stale-relevant: once a file starts
 * calling an auth helper, the allowlist entry becomes an error, forcing
 * removal. And once a new pre-session action appears, this list must be
 * updated deliberately (with a written rationale) rather than by accident.
 */
const INTENTIONALLY_UNAUTHENTICATED = new Set<string>([
  'src/app/(auth)/login/actions.ts',
  'src/app/(auth)/reset-password/actions.ts',
  'src/app/(portal)/portal/login/actions.ts',
  // src/app/(auth)/signup/actions.ts:
  //   Self-Signup für neue Mandanten. Läuft per Definition pre-session:
  //   der Aufrufer hat noch keinen Account und deshalb keine Membership.
  //   Ein requireTenantContext() wäre der klassische Chicken-and-egg-Fall.
  //   Die Action ruft supabase.auth.signUp() (Supabase erzwingt eigenes
  //   Rate-Limit) und legt bis zur E-Mail-Bestätigung noch keinen Tenant an;
  //   die Tenant-Anlage passiert erst im /auth/callback via Service-Role.
  'src/app/(auth)/signup/actions.ts',
]);

describe('Server Action auth coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered at least one file with top-level "use server"', () => {
      expect(ACTION_FILES.length).toBeGreaterThan(0);
    });
    it('at least one action file calls an auth helper', () => {
      expect(ACTION_FILES.some((f) => f.hasAuthCall)).toBe(true);
    });
  });

  describe('every "use server" file calls requireTenantContext or requireResidentContext (or is a whitelisted pre-session bootstrap)', () => {
    for (const f of ACTION_FILES) {
      it(`${f.file} either calls an auth helper or is in INTENTIONALLY_UNAUTHENTICATED`, () => {
        if (INTENTIONALLY_UNAUTHENTICATED.has(f.file)) {
          expect(
            f.hasAuthCall,
            `${f.file} is in INTENTIONALLY_UNAUTHENTICATED but now calls requireTenantContext/requireResidentContext. Remove the allowlist entry so this file is guarded like any other Server Action module.`,
          ).toBe(false);
          return;
        }
        expect(
          f.hasAuthCall,
          `${f.file} contains "'use server'" at file scope but never calls requireTenantContext() or requireResidentContext(). Every exported function in this file is a Server Action — callable from any client that can reach the /_next/action endpoint — and without an auth gate the action runs for anonymous requests too. Add "const ctx = await requireTenantContext();" (staff/admin actions) or "const ctx = await requireResidentContext();" (portal actions) as the first line of every exported action, or (only for genuine pre-session bootstrap flows like login/reset-password) add "${f.file}" to INTENTIONALLY_UNAUTHENTICATED with a written rationale.`,
        ).toBe(true);
      });
    }
  });
});
