import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP_DIR = join(process.cwd(), 'src', 'app');

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findRouteFiles(abs));
    } else if (entry.isFile() && entry.name === 'route.ts') {
      out.push(abs);
    }
  }
  return out;
}

/**
 * Every Next.js App-Router `route.ts` under src/app. Both /api routes and
 * co-located route handlers (e.g. /logout, /reports/<kind>/export) live under
 * the same directory tree and are subject to the same handler-name rules.
 */
const ROUTE_FILES = findRouteFiles(APP_DIR).sort();

/**
 * Match `export default …` at line start. Next.js App Router route handlers
 * are exclusively named exports (`GET`, `POST`, …) — a `default` export is
 * silently ignored, so a `route.ts` that ships one becomes a stealth 404/405
 * for every request. TypeScript does not catch this.
 */
const DEFAULT_EXPORT_RE = /^\s*export\s+default\b/m;

/**
 * Match top-level named exports of the form `export const X = …`,
 * `export function X(…)`, or `export async function X(…)`. We only need the
 * exported identifier to classify it (valid handler / lowercase typo / other),
 * so the RHS is not captured.
 *
 * `export { X } from '…'` re-exports are not matched — they are highly
 * unusual in a route.ts and would be a code smell to review manually anyway.
 */
const NAMED_EXPORT_RE =
  /^\s*export\s+(?:const|(?:async\s+)?function)\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm;

const VALID_HANDLERS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
]);

/**
 * Lowercase counterparts. Next.js resolves handler names case-sensitively —
 * `export async function get(…)` is not a handler, it is just a helper the
 * router never calls. This catches the very-easy-to-make typo where a dev
 * writes `get` / `post` / … out of muscle memory from other frameworks.
 */
const LOWERCASE_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
]);

interface RouteFile {
  file: string; // repo-relative path
  source: string;
  namedExports: string[];
  hasDefault: boolean;
}

function analyze(abs: string): RouteFile {
  const source = readFileSync(abs, 'utf8');
  const namedExports: string[] = [];
  for (const m of source.matchAll(NAMED_EXPORT_RE)) {
    namedExports.push(m[1]!);
  }
  return {
    file: relative(process.cwd(), abs).replace(/\\/g, '/'),
    source,
    namedExports,
    hasDefault: DEFAULT_EXPORT_RE.test(source),
  };
}

const ROUTES = ROUTE_FILES.map(analyze);

describe('Route handler method coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered at least one src/app/**/route.ts file', () => {
      expect(ROUTES.length).toBeGreaterThan(0);
    });
    it('at least one route.ts exports a valid HTTP handler', () => {
      const any = ROUTES.some((r) =>
        r.namedExports.some((n) => VALID_HANDLERS.has(n)),
      );
      expect(any).toBe(true);
    });
  });

  describe('no route.ts has a default export', () => {
    for (const r of ROUTES) {
      it(`${r.file} has no "export default"`, () => {
        expect(
          r.hasDefault,
          `${r.file} contains an "export default …". Next.js App Router only recognizes named exports (GET/POST/…) as route handlers — a default export is silently ignored, and every request to this route returns 404 (route not registered) or 405 (route registered by another export but the default is dead code). Rename the default export to one of GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD.`,
        ).toBe(false);
      });
    }
  });

  describe('every route.ts exports at least one valid HTTP handler', () => {
    for (const r of ROUTES) {
      it(`${r.file} exports one of GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD`, () => {
        const handlers = r.namedExports.filter((n) => VALID_HANDLERS.has(n));
        expect(
          handlers.length,
          `${r.file} does not export any of GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD. Next.js App Router treats a route.ts without a recognized handler export as an unregistered route — every request returns 404. Other named exports found: [${r.namedExports.join(', ') || '(none)'}]. Add the missing handler (e.g. "export async function GET(req) { … }") or delete the file if the route is dead.`,
        ).toBeGreaterThan(0);
      });
    }
  });

  describe('no route.ts exports a lowercase HTTP-method typo', () => {
    for (const r of ROUTES) {
      it(`${r.file} has no lowercase get/post/put/patch/delete/options/head export`, () => {
        const typos = r.namedExports.filter((n) => LOWERCASE_METHODS.has(n));
        expect(
          typos,
          `${r.file} exports [${typos.join(', ')}] — Next.js matches handler names case-sensitively, so lowercase HTTP methods are NOT recognized as handlers. Every request to this route bypasses the intended handler entirely (and returns 404/405 unless a properly-cased handler also exists). Rename to uppercase: ${typos.map((t) => `"${t}" → "${t.toUpperCase()}"`).join(', ')}.`,
        ).toEqual([]);
      });
    }
  });
});
