import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MODULES, SIGNUP_DEFAULT_MODULE_KEYS } from '../src/lib/modules/registry';
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
  '/map', // module: 'gps' — GPS-Karte und Live-Tracking noch nicht gebaut
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

  /**
   * Sprint 123: SIGNUP_DEFAULT_MODULE_KEYS ist die Menge, die ein neuer
   * Kunde beim Signup eingeschaltet bekommt. Sie ist bewusst "alles ausser
   * den Ausnahmen" formuliert, damit ein neu registriertes Modul
   * automatisch beim Kunden ankommt statt vergessen zu werden.
   *
   * Genau diese Bequemlichkeit ist aber auch die Gefahr: ein halbfertiges
   * Modul waere ab dem Tag seines Registry-Eintrags im Menue jedes neuen
   * Kunden — mit einem Link, der ins 404 fuehrt. Der erste Eindruck des
   * Produkts waere eine Fehlerseite.
   *
   * Deshalb dieser Riegel: was laut KNOWN_MISSING_PAGES noch keine Seite
   * hat, darf nicht in der Standardauswahl stehen. Der Ausschluss gehoert
   * nach NOT_ENABLED_ON_SIGNUP in src/lib/modules/registry.ts.
   */
  describe('Signup-Standardmodule zeigen auf gebaute Seiten', () => {
    const defaults = new Set<string>(SIGNUP_DEFAULT_MODULE_KEYS);

    it('sanity: die Standardauswahl ist nicht leer', () => {
      expect(defaults.size).toBeGreaterThan(0);
    });

    it('kein Kernmodul steht in der Standardauswahl', () => {
      // Core-Module sind laut getEnabledModules immer an. Stuenden sie
      // zusaetzlich hier, schriebe die Provisionierung ueberfluessige
      // tenant_modules-Zeilen — und ein `enabled: false` darauf saehe wie
      // ein wirksamer Ausschalter aus, obwohl er nichts bewirkt.
      const coreInDefaults = MODULES.filter((m) => m.core && defaults.has(m.key)).map((m) => m.key);
      expect(coreInDefaults).toEqual([]);
    });

    for (const mod of MODULES.filter((m) => !!m.menuPath && defaults.has(m.key))) {
      it(`Standardmodul "${mod.key}" (${mod.menuPath}) hat eine gebaute Seite`, () => {
        expect(
          KNOWN_MISSING_PAGES.has(mod.menuPath!),
          `Modul "${mod.key}" wird beim Signup automatisch aktiviert, aber sein menuPath "${mod.menuPath}" steht in KNOWN_MISSING_PAGES — die Seite existiert also nicht. Jeder neue Kunde bekaeme einen Menuepunkt, der ins 404 fuehrt. Entweder die Seite bauen (dann faellt der KNOWN_MISSING_PAGES-Eintrag ohnehin) oder "${mod.key}" in NOT_ENABLED_ON_SIGNUP (src/lib/modules/registry.ts) aufnehmen.`,
        ).toBe(false);
      });
    }
  });
});
