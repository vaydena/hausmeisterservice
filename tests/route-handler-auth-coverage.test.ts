import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP_DIR = join(process.cwd(), 'src', 'app');

/**
 * Recursively find `route.ts` and `route.tsx` files under src/app.
 * These are Next.js App-Router HTTP handlers — every export of GET,
 * POST, PUT, PATCH, DELETE, OPTIONS, HEAD is a live endpoint that any
 * caller can hit on the deployed origin. Without a per-file auth check
 * they are open API endpoints regardless of the parent route group.
 */
function walkRouteHandlers(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkRouteHandlers(abs));
    } else if (entry.isFile() && (entry.name === 'route.ts' || entry.name === 'route.tsx')) {
      out.push(abs);
    }
  }
  return out;
}

interface RouteHandlerFile {
  file: string;
  source: string;
}

const ALL_ROUTE_HANDLERS: RouteHandlerFile[] = walkRouteHandlers(APP_DIR)
  .map((abs) => ({
    file: relative(process.cwd(), abs).replace(/\\/g, '/'),
    source: readFileSync(abs, 'utf8'),
  }))
  .sort((a, b) => a.file.localeCompare(b.file));

/**
 * Marker patterns that indicate the handler is auth-gated. A file passes
 * the guard iff its source matches at least one — either the handler
 * calls the auth-context helpers directly, or it delegates to a known
 * transitive helper that itself performs the check, or it authorizes
 * via a shared secret (cron endpoints, webhook signatures).
 *
 *  - `requireTenantContext(`: the app-side auth+tenant scope helper.
 *    Throws if the caller is not authenticated or has no tenant, which
 *    the handler catches to return 401/500. Used by every /api/* and
 *    (app)/* route that talks to the DB on behalf of a user.
 *  - `requireResidentContext(`: same shape for the resident portal
 *    (portal/current.ts). No portal route currently uses this at the
 *    handler layer, but it's listed here so any future portal
 *    route.ts is covered without a guard edit.
 *  - `loadBillingDocumentData(`: the PDF loader in @/lib/pdf/loader
 *    which internally calls `requireTenantContext()` + RLS-scoped
 *    Supabase queries. The invoice/offer PDF routes delegate all auth
 *    to it, so its presence in the file signals transitive auth.
 *  - `.auth.signOut(`: logout routes call this to clear the session
 *    and redirect; they don't need to check auth first because
 *    signing out an unauthenticated caller is a no-op.
 *  - `AUTOMATION_CRON_SECRET`: the cron endpoint checks a Bearer token
 *    against this env var; the presence of the constant name in the
 *    source is enough to signal the shared-secret auth pattern.
 */
const AUTH_MARKERS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\brequireTenantContext\s*\(/, name: 'requireTenantContext(' },
  { pattern: /\brequireResidentContext\s*\(/, name: 'requireResidentContext(' },
  { pattern: /\bloadBillingDocumentData\s*\(/, name: 'loadBillingDocumentData(' },
  { pattern: /\.auth\.signOut\s*\(/, name: '.auth.signOut(' },
  { pattern: /\bAUTOMATION_CRON_SECRET\b/, name: 'AUTOMATION_CRON_SECRET (Bearer-token shared secret)' },
];

/**
 * Handlers that legitimately expose an unauthenticated endpoint. Each
 * entry must justify WHY the endpoint has no auth check AND confirm
 * that its response body contains nothing sensitive.
 *
 *  - src/app/api/push/vapid-key/route.ts:
 *      Returns the VAPID public key. VAPID public keys are, by design,
 *      not secret — they are the counterpart to the server's VAPID
 *      private key and get baked into browser push-subscription state.
 *      The endpoint is called from the service-worker registration on
 *      every page load, including unauthenticated pages, so gating it
 *      would break push subscription entirely.
 *
 *  - src/app/api/qr/[type]/[id]/route.ts:
 *      Returns an SVG QR code that encodes a deep-link URL. QR scans
 *      happen from paper printouts on properties, keys, or meters,
 *      before any login flow can run — the scanner just decodes the
 *      URL, which THEN redirects into the auth-gated app. The route
 *      itself only reveals the deep-link URL structure (type + UUID),
 *      which is not sensitive because the destination page requires
 *      auth to actually see data. Query params are validated
 *      (isValidQrType, isValidUuid) so the endpoint isn't a UUID-
 *      guessing oracle either.
 *
 * The test asserts entries stay stale-relevant: if any of these files
 * ever gains an auth marker (someone tightened them accidentally, or
 * a helper was renamed), the allowlist entry becomes an error. If any
 * of these files is deleted or moved, likewise.
 */
const INTENTIONALLY_PUBLIC_ROUTES = new Set<string>([
  'src/app/api/push/vapid-key/route.ts',
  'src/app/api/qr/[type]/[id]/route.ts',
]);

function findMarkers(source: string): string[] {
  return AUTH_MARKERS.filter((m) => m.pattern.test(source)).map((m) => m.name);
}

describe('Route-handler auth coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many route handler files', () => {
      expect(ALL_ROUTE_HANDLERS.length).toBeGreaterThan(5);
    });
    it('auth-marker registry is non-empty', () => {
      expect(AUTH_MARKERS.length).toBeGreaterThan(0);
    });
  });

  describe('every route handler is either auth-gated or on the intentionally-public allowlist', () => {
    for (const rh of ALL_ROUTE_HANDLERS) {
      it(`${rh.file} has an auth marker OR is on INTENTIONALLY_PUBLIC_ROUTES`, () => {
        const markers = findMarkers(rh.source);
        const isPublic = INTENTIONALLY_PUBLIC_ROUTES.has(rh.file);
        if (isPublic) {
          expect(
            markers,
            `${rh.file} is on INTENTIONALLY_PUBLIC_ROUTES but its source now contains auth marker(s): ${markers.join(', ')}. Either the file was tightened (great — delete the allowlist entry so this route is guarded like any other) or a shared helper was renamed and now happens to match an auth pattern. Investigate and update accordingly.`,
          ).toEqual([]);
          return;
        }
        expect(
          markers.length > 0,
          `${rh.file} is a Next.js App-Router route handler — every exported HTTP method is a live endpoint on the deployed origin. Its source contains none of the known auth markers: ${AUTH_MARKERS.map((m) => m.name).join(', ')}. That means any caller on the internet can hit this endpoint without a session. Two ways forward: (1) add an auth check — the standard pattern is \`const ctx = await requireTenantContext();\` at the top of each exported method (wrap in try/catch to return 401 on the failure case); for the portal side use \`requireResidentContext()\`; for cron/webhook shared-secret patterns check a Bearer token against an env var. (2) If the endpoint is genuinely public (no user data, no side effects that require identity), add "${rh.file}" to INTENTIONALLY_PUBLIC_ROUTES in this test with a written rationale explaining WHY it's safe to serve unauthenticated AND confirming the response body contains nothing sensitive. If the auth check happens transitively via a helper that isn't in AUTH_MARKERS yet, add the helper name to AUTH_MARKERS with a rationale for what it does.`,
        ).toBe(true);
      });
    }
  });

  describe('intentionally-public allowlist entries still exist', () => {
    for (const entry of INTENTIONALLY_PUBLIC_ROUTES) {
      it(`allowlist entry "${entry}" still exists on disk`, () => {
        expect(
          existsSync(join(process.cwd(), entry)),
          `INTENTIONALLY_PUBLIC_ROUTES contains "${entry}" but that file no longer exists. Delete the allowlist entry.`,
        ).toBe(true);
        const hit = ALL_ROUTE_HANDLERS.find((x) => x.file === entry);
        expect(
          hit,
          `INTENTIONALLY_PUBLIC_ROUTES contains "${entry}" but the walker didn't pick it up as a route.ts file. Either the file was renamed or the walker's filter changed.`,
        ).toBeDefined();
      });
    }
  });
});
