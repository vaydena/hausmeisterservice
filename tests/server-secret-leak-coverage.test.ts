import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_DIR = join(process.cwd(), 'src');

function walkTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsx(abs));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      out.push(abs);
    }
  }
  return out;
}

/**
 * Server-side secrets. Leaking any of these into the client bundle is a
 * catastrophic auth failure:
 *  - SUPABASE_SERVICE_ROLE_KEY bypasses every RLS policy on the database.
 *  - AUTOMATION_CRON_SECRET protects the cron trigger from anonymous DoS.
 *  - RESEND_API_KEY authorizes sending mail on our behalf.
 *  - VAPID_PRIVATE_KEY signs web-push notifications from our domain.
 *  - SUPABASE_JWT_SECRET signs (and validates) auth tokens.
 *
 * NEXT_PUBLIC_* keys are intentionally client-visible and are not in this
 * list — Next.js inlines them into the bundle by design.
 */
const SERVER_SECRETS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'AUTOMATION_CRON_SECRET',
  'RESEND_API_KEY',
  'VAPID_PRIVATE_KEY',
  'SUPABASE_JWT_SECRET',
] as const;

/**
 * Match a property access like `process.env.X`, `env.X`, or `.X` on any
 * object destructured from serverEnv(). The leading `.` prevents matching
 * bare mentions in comments ("if RESEND_API_KEY is set …"), which are not
 * actual reads of the value. If a future file ever legitimately reads a
 * secret without a leading `.` (e.g. via bracket notation `env['X']` or
 * `Reflect.get(env, 'X')`), extend this regex.
 */
const SECRET_ACCESS_RE = new RegExp(`\\.(${SERVER_SECRETS.join('|')})\\b`);

/**
 * Any of these three markers makes a file safe to reference a server secret:
 *  - `'use server'` at file scope: Server Actions module, only ever runs
 *    server-side (Next.js does not ship it to the client bundle).
 *  - `import 'server-only'`: Next.js's explicit tree-shake marker. If a
 *    client component ever imports a file with this marker, the bundler
 *    throws at build time — a hard fail, not a runtime surprise.
 *  - path under `src/app/api/**`: Route Handlers, only ever run on the
 *    server by Next.js's routing convention.
 */
const USE_SERVER_RE = /^\s*['"]use server['"];?\s*$/m;
const SERVER_ONLY_IMPORT_RE = /^import\s+['"]server-only['"]/m;
const USE_CLIENT_RE = /^\s*['"]use client['"];?\s*$/m;

interface SecretFile {
  file: string; // repo-relative, forward slashes
  isApiRoute: boolean;
  hasUseServer: boolean;
  hasServerOnly: boolean;
  hasUseClient: boolean;
}

const SECRET_FILES: SecretFile[] = walkTsx(SRC_DIR)
  .map((abs) => {
    const source = readFileSync(abs, 'utf8');
    return {
      abs,
      source,
      matches: SECRET_ACCESS_RE.test(source),
    };
  })
  .filter((x) => x.matches)
  .map((x) => {
    const file = relative(process.cwd(), x.abs).replace(/\\/g, '/');
    return {
      file,
      isApiRoute: /^src\/app\/api\//.test(file),
      hasUseServer: USE_SERVER_RE.test(x.source),
      hasServerOnly: SERVER_ONLY_IMPORT_RE.test(x.source),
      hasUseClient: USE_CLIENT_RE.test(x.source),
    };
  })
  .sort((a, b) => a.file.localeCompare(b.file));

/**
 * Files that touch server secrets but do NOT carry a server-only marker.
 * Each entry must be a hard-coded definitional file whose sole purpose
 * is declaring the env shape — never a consumer.
 *
 *  - src/lib/env.ts: the Zod schema itself, listing every server var and
 *    calling `process.env.X` to bind values. This file MUST NOT get an
 *    `import 'server-only'` marker: `clientEnv` (defined right next to
 *    `serverEnv`) is legitimately imported by client components for
 *    NEXT_PUBLIC_* keys, and adding `server-only` would break every
 *    client import of `@/lib/env`. Instead, `serverEnv()` gates itself
 *    at runtime via `typeof window !== 'undefined'` throw — see the
 *    function body. The secret names appearing in this file are schema
 *    fields, not leaked values.
 *
 * The test asserts entries stay stale-relevant: once env.ts gains an
 * `import 'server-only'` marker or moves the secrets into a dedicated
 * server-only file, the allowlist entry becomes an error and forces a
 * fresh review.
 */
const INTENTIONALLY_UNGUARDED_SECRET_FILES = new Set<string>([
  'src/lib/env.ts',
]);

describe('Server-secret leak coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered at least one file that reads a server secret', () => {
      expect(SECRET_FILES.length).toBeGreaterThan(0);
    });
    it('at least one secret-reading file carries a server-only marker', () => {
      expect(
        SECRET_FILES.some((f) => f.isApiRoute || f.hasUseServer || f.hasServerOnly),
      ).toBe(true);
    });
  });

  describe('every server-secret consumer is bundler-forced to server-only', () => {
    for (const f of SECRET_FILES) {
      it(`${f.file} is under /api, has "use server", or imports 'server-only' (or is a whitelisted schema file)`, () => {
        const guarded = f.isApiRoute || f.hasUseServer || f.hasServerOnly;
        if (INTENTIONALLY_UNGUARDED_SECRET_FILES.has(f.file)) {
          expect(
            guarded,
            `${f.file} is in INTENTIONALLY_UNGUARDED_SECRET_FILES but now carries a server-only marker (use-server / server-only / api-route). Remove the allowlist entry so this file is guarded like any other server-secret consumer.`,
          ).toBe(false);
          return;
        }
        expect(
          guarded,
          `${f.file} references a server-side secret (${SERVER_SECRETS.join(' / ')}) but has no bundler-enforced server-only marker. Any of these three fixes works: (1) add "import 'server-only';" as the first statement (Next.js will throw at build time if this file is ever imported by a client component), (2) add "'use server';" at file scope if every export is a Server Action, or (3) move the file under src/app/api/**/route.ts. Without one of these, a stray import from a client component silently ships the secret name into the browser bundle — and while the VALUE resolves to undefined client-side (Next.js only injects NEXT_PUBLIC_*), the guard is protecting against the next step: a developer noticing "hey, X is undefined on the client" and adding NEXT_PUBLIC_ to it. If this file is intentionally the shared schema definition (like env.ts), add it to INTENTIONALLY_UNGUARDED_SECRET_FILES with a written rationale.`,
        ).toBe(true);
      });
    }
  });

  describe('no server-secret consumer is a client component', () => {
    for (const f of SECRET_FILES) {
      it(`${f.file} does not have "use client"`, () => {
        expect(
          f.hasUseClient,
          `${f.file} references a server-side secret AND has "'use client'" at file scope. This is the worst-case scenario: the file is explicitly marked for the client bundle, so the secret name (and every value the file computes from it) ships to the browser. Remove the "'use client'" directive and refactor the file into a Server Component or Server Action; if the client legitimately needs a subset of this data, expose only the non-secret parts through a Server Action return value or a NEXT_PUBLIC_ variable.`,
        ).toBe(false);
      });
    }
  });
});
