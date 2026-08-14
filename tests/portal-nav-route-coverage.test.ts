import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PORTAL_DIR = join(process.cwd(), 'src', 'app', '(portal)', 'portal');
const NAV_FILE = join(process.cwd(), 'src', 'app', '(portal)', 'portal', '_components', 'portal-nav.tsx');

/**
 * Extract every `href: '/portal/…'` literal from portal-nav.tsx. The nav is a
 * static tuple, so a regex over the source is more reliable than a runtime
 * import (portal-nav.tsx is a client component that pulls in next/link and
 * next/navigation, neither of which resolves in a Vitest node env).
 */
const NAV_HREF_RE = /href:\s*['"](\/portal\/[a-z0-9_-]+)['"]/gi;

const navSource = readFileSync(NAV_FILE, 'utf8');
const NAV_HREFS: string[] = [];
for (const m of navSource.matchAll(NAV_HREF_RE)) {
  NAV_HREFS.push(m[1]!);
}

/**
 * Walk the portal app directory and collect every top-level segment that has
 * its own `page.tsx` (i.e. `/portal/<seg>/page.tsx`). Sub-routes (`/portal/
 * <seg>/[id]`, `/portal/<seg>/new`) are children of the same segment and do
 * not need their own nav entry.
 */
function collectTopLevelSegments(): string[] {
  const entries = readdirSync(PORTAL_DIR, { withFileTypes: true });
  const segments: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_') || entry.name.startsWith('[')) continue;
    const pagePath = join(PORTAL_DIR, entry.name, 'page.tsx');
    if (existsSync(pagePath) && statSync(pagePath).isFile()) {
      segments.push(entry.name);
    }
  }
  return segments;
}

const TOP_LEVEL_SEGMENTS = collectTopLevelSegments();

/**
 * Segments that intentionally do NOT appear in the resident nav.
 *  - `login`: the sign-in landing page. Residents reach it via the unauth
 *    redirect, never via the authenticated nav.
 *  - `account`: Sprint 32. Konto-Selbstverwaltung (MFA-Enroll, spaeter
 *    Passwort/Sessions). Erreichbar ueber den User-Avatar-Dropdown oben
 *    rechts (PortalUserMenu → "Konto"), nicht ueber die Hauptnavigation.
 *    Wir halten die Top-Nav bewusst kurz auf die wenigen aktiven Portal-
 *    Funktionen (Uebersicht, Ankuendigungen, Meldungen, Nachrichten);
 *    Kontoeinstellungen sind ein Randfall, der aus dem Avatar-Menue
 *    erreichbar sein sollte, nicht permanent im Header sichtbar.
 *
 * Stale entries are asserted below (once a segment appears in the nav, the
 * allowlist entry must be removed).
 */
const INTENTIONALLY_NAV_HIDDEN = new Set<string>(['login', 'account']);

function segmentOfHref(href: string): string {
  return href.replace(/^\/portal\//, '').split('/')[0]!;
}

describe('Portal nav ↔ route coverage', () => {
  describe('sanity: extractors found something', () => {
    it('portal-nav.tsx yields at least one nav href', () => {
      expect(NAV_HREFS.length).toBeGreaterThan(0);
    });
    it('scanner discovered at least one top-level portal page', () => {
      expect(TOP_LEVEL_SEGMENTS.length).toBeGreaterThan(0);
    });
  });

  describe('every nav href targets an existing page.tsx', () => {
    for (const href of [...new Set(NAV_HREFS)].sort()) {
      it(`nav href "${href}" → src/app/(portal)${href}/page.tsx exists`, () => {
        const rel = href.replace(/^\//, '').split('/').join('/');
        const abs = join(process.cwd(), 'src', 'app', '(portal)', ...rel.split('/'), 'page.tsx');
        expect(
          existsSync(abs),
          `Portal nav references "${href}" but src/app/(portal)/${rel}/page.tsx does not exist. Sidebar click leads to a 404 for every resident. Either add the page or remove the nav item.`,
        ).toBe(true);
      });
    }
  });

  describe('every top-level portal segment has a nav entry (or is intentionally hidden)', () => {
    const NAV_SEGMENTS = new Set(NAV_HREFS.map(segmentOfHref));

    for (const seg of [...TOP_LEVEL_SEGMENTS].sort()) {
      it(`segment "${seg}" (src/app/(portal)/portal/${seg}/page.tsx) is reachable from portal-nav.tsx`, () => {
        if (INTENTIONALLY_NAV_HIDDEN.has(seg)) {
          expect(
            NAV_SEGMENTS.has(seg),
            `"${seg}" is in INTENTIONALLY_NAV_HIDDEN but portal-nav.tsx now links to /portal/${seg}. Remove the allowlist entry so this segment is guarded like any other.`,
          ).toBe(false);
          return;
        }
        expect(
          NAV_SEGMENTS.has(seg),
          `Portal route /portal/${seg} exists (src/app/(portal)/portal/${seg}/page.tsx) but no ITEMS entry in src/app/(portal)/portal/_components/portal-nav.tsx links to it. Residents can only reach the page by knowing the URL. Either add a nav entry or (only with rationale) add "${seg}" to INTENTIONALLY_NAV_HIDDEN.`,
        ).toBe(true);
      });
    }
  });
});
