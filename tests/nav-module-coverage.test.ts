import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MODULES } from '../src/lib/modules/registry';
import {
  NAV_GROUPS,
  MOBILE_NAV_ITEMS,
  type NavItem,
} from '../src/components/layout/nav-config';

const APP_DIR = join(process.cwd(), 'src', 'app', '(app)');

const KNOWN_MODULE_KEYS = new Set<string>(MODULES.map((m) => m.key));

const ALL_NAV_ITEMS: NavItem[] = [
  ...NAV_GROUPS.flatMap((g) => [...g.items]),
  ...MOBILE_NAV_ITEMS,
];

function urlToPageFile(href: string): string {
  const clean = href.replace(/[?#].*$/, '');
  const segments = clean.split('/').filter(Boolean);
  return join(APP_DIR, ...segments, 'page.tsx');
}

/**
 * Nav hrefs whose page.tsx has intentionally not been built yet. The sidebar
 * entry stays so the roadmap is visible in the UI. This test also asserts
 * that once page.tsx appears, the allowlist entry is removed — otherwise the
 * allowlist rots into camouflage for real regressions.
 */
const KNOWN_MISSING_PAGES = new Set<string>([
  '/map',        // module: 'gps' — GPS-Karte und Live-Tracking noch nicht gebaut
  '/documents',  // module: 'documents' — zentrale Dokumenten-Liste noch nicht gebaut (Uploader ist bereits an Work Order + Defect Report angeflanscht)
]);

describe('Nav-config <-> module-registry consistency', () => {
  describe('sanity: extractors found something', () => {
    it('MODULES is non-empty', () => {
      expect(MODULES.length).toBeGreaterThan(0);
    });
    it('NAV_GROUPS + MOBILE_NAV_ITEMS is non-empty', () => {
      expect(ALL_NAV_ITEMS.length).toBeGreaterThan(0);
    });
  });

  describe('NavItem.module references a declared ModuleKey', () => {
    for (const item of ALL_NAV_ITEMS) {
      if (item.module === null) continue;
      const key = item.module;
      it(`nav "${item.href}" module="${key}" is registered`, () => {
        expect(
          KNOWN_MODULE_KEYS.has(key),
          `NavItem module "${key}" (href ${item.href}) is not in MODULES (src/lib/modules/registry.ts). filterNavGroups drops items whose module is not in the tenant's enabled set — so an unknown key means "link never renders". Add the key to MODULES or fix the typo.`,
        ).toBe(true);
      });
    }
  });

  describe('NavItem.href routes to a real page.tsx', () => {
    for (const item of ALL_NAV_ITEMS) {
      const href = item.href;
      // No dynamic-param hrefs live in the top-level nav today; skip if any appear.
      if (/\[[^\]]+\]/.test(href)) continue;
      it(`nav "${href}" → page.tsx exists (or is allowlisted)`, () => {
        const file = urlToPageFile(href);
        if (KNOWN_MISSING_PAGES.has(href)) {
          expect(
            existsSync(file),
            `KNOWN_MISSING_PAGES contains "${href}" but ${file} now exists — remove the allowlist entry so the test guards this route again.`,
          ).toBe(false);
          return;
        }
        expect(
          existsSync(file),
          `Nav item "${href}" is visible in the sidebar but has no corresponding page.tsx under src/app/(app). Users clicking it get 404.\nExpected: ${file}`,
        ).toBe(true);
      });
    }
  });

  describe('Modules with menuPath are reachable via nav', () => {
    const modulesWithPath = MODULES.filter((m) => !!m.menuPath);
    for (const mod of modulesWithPath) {
      it(`module "${mod.key}" (menuPath ${mod.menuPath}) has at least one NavItem`, () => {
        const covering = ALL_NAV_ITEMS.filter((it) => it.module === mod.key);
        expect(
          covering.length,
          `Module "${mod.key}" declares menuPath "${mod.menuPath}" but no NavItem uses module: "${mod.key}". The declared path is dead registry configuration — either wire up a NavItem or drop the menuPath.`,
        ).toBeGreaterThan(0);
      });
    }
  });
});
