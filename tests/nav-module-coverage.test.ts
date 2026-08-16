import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  MODULES,
  SIGNUP_DEFAULT_MODULE_KEYS,
  UNBUILT_MODULE_KEYS,
  type ModuleKey,
} from '../src/lib/modules/registry';
import type { PermissionKey } from '../src/lib/permissions/registry';
import {
  NAV_GROUPS,
  MOBILE_NAV_ITEMS,
  filterNavGroups,
  filterNavItems,
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
 * Sprint 131: abgeleitet, nicht gepflegt.
 *
 * Bis hierher stand hier eine handgefuehrte Allowlist `KNOWN_MISSING_PAGES`
 * mit `/map` darin — und in der Registry stand dasselbe Wissen ein zweites
 * Mal als `gps` in `NOT_ENABLED_ON_SIGNUP`. Zwei Listen fuer eine Tatsache.
 * Der Preis dafuer stand am 16.08.2026 live beim ersten Testkunden: die
 * Testdatei wusste Bescheid, die Seitenleiste nicht.
 *
 * Jetzt ist `unbuilt: true` am Modul die eine Quelle, und dieser Test leitet
 * seine Ausnahmen daraus ab.
 */
const UNBUILT_MODULES = new Set<string>(UNBUILT_MODULE_KEYS);
const UNBUILT_MENU_PATHS = new Set<string>(
  MODULES.filter((m) => m.unbuilt && m.menuPath).map((m) => m.menuPath!),
);

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
      const excused = item.module !== null && UNBUILT_MODULES.has(item.module);
      it(`nav "${href}" → page.tsx exists${excused ? ' (Modul ist als unbuilt markiert)' : ''}`, () => {
        const file = urlToPageFile(href);
        if (excused) return;
        expect(
          existsSync(file),
          `Nav item "${href}" is visible in the sidebar but has no corresponding page.tsx under src/app/(app). Users clicking it get 404.\nExpected: ${file}\nEntweder die Seite bauen oder das Modul in src/lib/modules/registry.ts mit "unbuilt: true" markieren — dann verschwindet der Link ueberall, statt nur hier entschuldigt zu werden.`,
        ).toBe(true);
      });
    }
  });

  /**
   * Die Gegenrichtung, und die eigentlich wichtige: eine Ausnahme, die
   * niemand zurueckzieht, ist auf Dauer schlimmer als keine. Ein Modul, das
   * `unbuilt` heisst, obwohl die Seite laengst existiert, ist unsichtbar —
   * kein Kunde kann es einschalten, und niemand merkt es, weil nichts kaputt
   * aussieht.
   */
  describe('"unbuilt" bleibt ehrlich', () => {
    for (const mod of MODULES.filter((m) => m.unbuilt)) {
      it(`Modul "${mod.key}" ist als unbuilt markiert und hat wirklich keine Seite`, () => {
        expect(
          mod.menuPath,
          `Modul "${mod.key}" ist "unbuilt: true", deklariert aber keinen menuPath. Dann ist die Markierung wirkungslos — sie beschreibt eine Seite, die niemand verlinkt. Entweder menuPath ergaenzen oder das Flag entfernen.`,
        ).toBeTruthy();
        const file = urlToPageFile(mod.menuPath!);
        expect(
          existsSync(file),
          `Modul "${mod.key}" traegt "unbuilt: true", aber ${file} existiert. Das Flag versteckt das Modul vor Navigation, Signup-Vorauswahl und Schaltern — die Seite ist also gebaut und trotzdem fuer niemanden erreichbar. Flag in src/lib/modules/registry.ts entfernen.`,
        ).toBe(false);
      });
    }
  });

  /**
   * Der Fall, der am 16.08.2026 live stand: Mandant hat `gps` an (aus der
   * Zeit vor dem Signup-Riegel), Trial gibt alle Features frei, 8 von 15
   * Rollen haben `gps.view` — also rendert die Seitenleiste "Karte" und der
   * Link fuehrt ins 404. Der Riegel aus Sprint 123 sass nur an der
   * Signup-Vorauswahl und griff bei Altbestaenden nicht.
   *
   * Deshalb hier der Vollausschlag: alles eingeschaltet, alles erlaubt.
   * Genau die Konstellation, unter der jede andere Pruefung nachgibt.
   */
  describe('Navigation zeigt ungebautes nicht — auch bei allem an', () => {
    const allModules = new Set<ModuleKey>(MODULES.map((m) => m.key));
    const allPermissions = new Set<PermissionKey>(
      ALL_NAV_ITEMS.map((i) => i.permission).filter((p): p is PermissionKey => p !== null),
    );

    const visible: NavItem[] = [
      ...filterNavGroups(NAV_GROUPS, allModules, allPermissions).flatMap((g) => g.items),
      ...filterNavItems(MOBILE_NAV_ITEMS, allModules, allPermissions),
    ];

    it('sanity: bei allem an bleibt der Grossteil der Navigation stehen', () => {
      // Ohne diese Zeile wuerde ein `return []` in filterNavGroups die
      // Pruefung darunter bestehen lassen.
      expect(visible.length).toBeGreaterThan(ALL_NAV_ITEMS.length / 2);
    });

    it('kein sichtbarer Eintrag gehoert zu einem ungebauten Modul', () => {
      const leaked = visible
        .filter((i) => i.module !== null && UNBUILT_MODULES.has(i.module))
        .map((i) => `${i.href} (${i.module})`);
      expect(
        leaked,
        `Diese Links stehen in der Seitenleiste, obwohl ihr Modul als "unbuilt" markiert ist — sie fuehren ins 404: ${leaked.join(', ')}`,
      ).toEqual([]);
    });

    it('jeder sichtbare Link zeigt auf eine gebaute Seite', () => {
      // Die Zusammenfuehrung beider Richtungen: was nach dem Filter uebrig
      // bleibt, muss auf der Platte liegen. Diese Pruefung kennt weder
      // Allowlist noch Flag — sie schaut nach.
      const dead = visible
        .filter((i) => !/\[[^\]]+\]/.test(i.href))
        .filter((i) => !existsSync(urlToPageFile(i.href)))
        .map((i) => i.href);
      expect(dead, `Sichtbare Nav-Links ohne page.tsx: ${dead.join(', ')}`).toEqual([]);
    });
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
   * Sprint 123: `SIGNUP_DEFAULT_MODULE_KEYS` ist die Menge, die ein neuer
   * Kunde beim Signup eingeschaltet bekommt. Sie ist bewusst "alles ausser
   * den Ausnahmen" formuliert, damit ein neu registriertes Modul
   * automatisch beim Kunden ankommt statt vergessen zu werden.
   *
   * Genau diese Bequemlichkeit ist die Gefahr: ein halbfertiges Modul waere
   * ab dem Tag seines Registry-Eintrags im Menue jedes neuen Kunden — mit
   * einem Link ins 404. Der erste Eindruck des Produkts waere eine
   * Fehlerseite.
   *
   * Sprint 131 · zwei Pruefungen sind hier ersatzlos entfallen: "kein
   * Kernmodul in der Standardauswahl" und "kein ungebautes Modul in der
   * Standardauswahl". Beide filtert die Ableitung selbst heraus
   * (`!m.core && !m.unbuilt`) — sie koennten nicht mehr fehlschlagen. Ein
   * Test, der nicht fehlschlagen kann, misst nichts; er beruhigt nur.
   * Was bleibt, ist die Frage an die Platte.
   */
  describe('Signup-Standardmodule zeigen auf gebaute Seiten', () => {
    const defaults = new Set<string>(SIGNUP_DEFAULT_MODULE_KEYS);

    it('sanity: die Standardauswahl ist nicht leer', () => {
      expect(defaults.size).toBeGreaterThan(0);
    });

    for (const mod of MODULES.filter((m) => !!m.menuPath && defaults.has(m.key))) {
      it(`Standardmodul "${mod.key}" (${mod.menuPath}) hat eine gebaute Seite`, () => {
        expect(
          existsSync(urlToPageFile(mod.menuPath!)),
          `Modul "${mod.key}" wird beim Signup automatisch aktiviert, aber ${urlToPageFile(mod.menuPath!)} existiert nicht. Jeder neue Kunde bekaeme einen Menuepunkt, der ins 404 fuehrt. Entweder die Seite bauen oder "${mod.key}" in src/lib/modules/registry.ts mit "unbuilt: true" markieren.`,
        ).toBe(true);
      });
    }
  });

  /**
   * Der stille Rest: `UNBUILT_MENU_PATHS` wird oben aufgebaut, aber nur hier
   * gelesen. Die Zeile haelt fest, dass beide Ableitungen — ueber den
   * Modul-Key und ueber den Pfad — dieselbe Menge Seiten meinen.
   */
  it('ungebaute Menuepfade und ungebaute Module beschreiben dieselben Links', () => {
    const byKey = ALL_NAV_ITEMS.filter((i) => i.module !== null && UNBUILT_MODULES.has(i.module))
      .map((i) => i.href)
      .sort();
    const byPath = ALL_NAV_ITEMS.filter((i) => UNBUILT_MENU_PATHS.has(i.href))
      .map((i) => i.href)
      .sort();
    expect(byKey).toEqual(byPath);
  });
});
