import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  MODULES,
  DEFAULT_ON_MODULE_KEYS,
  UNBUILT_MODULE_KEYS,
  type ModuleDefinition,
  type ModuleKey,
} from '../src/lib/modules/registry';
import {
  MODULES_OUTSIDE_APP_ROUTE_GROUP,
  pagePathsForModule,
} from '../src/lib/modules/module-map';
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

/** Liegt irgendwo unter diesem Verzeichnis eine page.tsx? */
function containsPage(dir: string): boolean {
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (containsPage(join(dir, entry.name))) return true;
    } else if (entry.name === 'page.tsx') {
      return true;
    }
  }
  return false;
}

/**
 * Sprint 133 · Die eine Frage, aus der beide Richtungen unten folgen:
 * WELCHE gebauten Seiten hat dieses Modul?
 *
 * Rekursiv, nicht nur `<prefix>/page.tsx` — die QR-Codes haben unter `/qr`
 * keine eigene Indexseite, aber `/qr/print` und `/qr/[type]/[id]`. Wer nur
 * die Wurzel prueft, haelt ein gebautes Modul faelschlich fuer leer.
 *
 * Die Pfade kommen aus `pagePathsForModule` (menuPath + MODULE_PATHS), die
 * Ausnahme fuer Route-Groups ausserhalb von `(app)` aus
 * `MODULES_OUTSIDE_APP_ROUTE_GROUP`. Beides steht in module-map.ts — dieser
 * Test baut die Regel nicht nach, er liest sie und schaut auf der Platte nach.
 */
function builtPagesFor(mod: ModuleDefinition): string[] {
  const hits: string[] = [];

  const outside = MODULES_OUTSIDE_APP_ROUTE_GROUP[mod.key];
  if (outside && containsPage(join(process.cwd(), outside))) hits.push(outside);

  for (const prefix of pagePathsForModule(mod.key)) {
    const dir = join(APP_DIR, ...prefix.split('/').filter(Boolean));
    if (containsPage(dir)) hits.push(prefix);
  }

  return hits;
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
   * SPRINT 133 — DIE PRUEFUNG, DIE VIER MODULE ZU LANGE VERFEHLT HAT.
   *
   * Ein abschaltbares Modul ist ein Versprechen an den Kunden: unter
   * Einstellungen -> Mandant steht sein Name mit einem Schalter daneben, und
   * beim Signup ist er eingeschaltet. `shifts`, `photos`, `work_reports` und
   * `owner_portal` hielten dieses Versprechen nie ein — keine Seite, keine
   * Route, kein Menuepunkt. Wer "Schichten" einschaltete, bekam nicht einmal
   * eine Fehlerseite: es passierte schlicht nichts.
   *
   * Alle bisherigen Pruefungen gingen daran vorbei, weil sie samt und sonders
   * bei einem Link anfingen — Nav-Eintrag, menuPath, Signup-Vorauswahl mit
   * menuPath. Ein Modul ohne jeden Link hatte nichts, woran sie sich haetten
   * festhalten koennen. Der teuerste Fehlertyp in diesem Projekt ist der
   * Wachposten, der genau an einer der Stellen steht, an denen er gebraucht
   * wird; der zweitteuerste ist der, dessen Bedingung nie zutrifft.
   *
   * Deshalb faengt diese Pruefung beim Modul an, nicht beim Link, und stellt
   * beide Richtungen derselben Frage:
   *
   *   gebaut  -> es muss mindestens eine Seite geben
   *   unbuilt -> es darf keine geben
   *
   * Ein Praedikat, zwei Vorzeichen. Was die eine Richtung durchlaesst, faengt
   * die andere: ein fertig gebautes Modul, dem jemand das Flag zu entfernen
   * vergisst, bleibt sonst fuer alle Kunden unsichtbar — und das sieht von
   * aussen nicht nach einem Fehler aus, sondern nach einer Entscheidung.
   */
  describe('Jedes Modul fuehrt irgendwohin — oder heisst unbuilt', () => {
    it('sanity: die Platte wird wirklich gelesen', () => {
      // Ohne diese Zeile wuerde ein containsPage(), das immer false liefert,
      // die erste Gruppe unten stumm durchwinken.
      const properties = MODULES.find((m) => m.key === 'properties')!;
      expect(builtPagesFor(properties)).toContain('/properties');
    });

    for (const mod of MODULES.filter((m) => !m.core && !m.unbuilt)) {
      it(`Modul "${mod.labelDe}" (${mod.key}) hat mindestens eine gebaute Seite`, () => {
        expect(
          builtPagesFor(mod),
          `Das Modul "${mod.labelDe}" laesst sich unter Einstellungen -> Mandant einschalten und ist bei jedem neuen Mandanten an — aber es gibt keine einzige Seite dazu. Der Schalter tut nichts, und der Kunde erfaehrt nicht, warum.\n` +
            `Geprueft wurden: ${pagePathsForModule(mod.key).join(', ') || '(keine Pfade deklariert)'}\n` +
            `Entweder die Seiten bauen und den Pfad in MODULE_PATHS eintragen (src/lib/modules/module-map.ts), oder "${mod.key}" in src/lib/modules/registry.ts mit "unbuilt: true" markieren — dann verschwindet der Schalter, statt zu luegen.`,
        ).not.toEqual([]);
      });
    }

    for (const mod of MODULES.filter((m) => m.unbuilt)) {
      it(`Modul "${mod.labelDe}" (${mod.key}) traegt unbuilt und hat wirklich keine Seite`, () => {
        expect(
          builtPagesFor(mod),
          `Modul "${mod.key}" traegt "unbuilt: true", aber unter diesen Pfaden liegen Seiten. Das Flag versteckt das Modul vor Navigation, Signup-Vorauswahl und Schaltern — gebaut und trotzdem fuer keinen Kunden erreichbar. Flag in src/lib/modules/registry.ts entfernen.`,
        ).toEqual([]);
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
   * Sprint 123: `DEFAULT_ON_MODULE_KEYS` (damals SIGNUP_DEFAULT_MODULE_KEYS)
   * ist die Menge, die ein Kunde ohne eigenes Zutun eingeschaltet bekommt.
   * Sie ist bewusst "alles ausser den Ausnahmen" formuliert, damit ein neu
   * registriertes Modul automatisch beim Kunden ankommt statt vergessen zu
   * werden.
   *
   * Genau diese Bequemlichkeit ist die Gefahr: ein halbfertiges Modul waere
   * ab dem Tag seines Registry-Eintrags im Menue jedes Kunden — mit einem
   * Link ins 404. Der erste Eindruck des Produkts waere eine Fehlerseite.
   *
   * Sprint 136 · die Menge wiegt jetzt schwerer als vorher. Bis hierher
   * betraf sie nur Mandanten, die nach Sprint 123 entstanden sind; seit
   * `getEnabledModules` eine fehlende Zeile als AN liest, gilt sie fuer
   * jeden Mandanten, der zu einem Modul nie etwas hinterlegt hat. Ein
   * versehentlich gebautes-aber-nicht-fertiges Modul erreicht damit auch
   * den Bestand.
   *
   * Sprint 131 · zwei Pruefungen sind hier ersatzlos entfallen: "kein
   * Kernmodul in der Standardauswahl" und "kein ungebautes Modul in der
   * Standardauswahl". Beide filtert die Ableitung selbst heraus
   * (`!m.core && !m.unbuilt`) — sie koennten nicht mehr fehlschlagen. Ein
   * Test, der nicht fehlschlagen kann, misst nichts; er beruhigt nur.
   * Was bleibt, ist die Frage an die Platte.
   */
  describe('Standardmodule zeigen auf gebaute Seiten', () => {
    const defaults = new Set<string>(DEFAULT_ON_MODULE_KEYS);

    it('sanity: die Standardauswahl ist nicht leer', () => {
      expect(defaults.size).toBeGreaterThan(0);
    });

    for (const mod of MODULES.filter((m) => !!m.menuPath && defaults.has(m.key))) {
      it(`Standardmodul "${mod.key}" (${mod.menuPath}) hat eine gebaute Seite`, () => {
        expect(
          existsSync(urlToPageFile(mod.menuPath!)),
          `Modul "${mod.key}" ist ohne gegenteilige Angabe aktiv, aber ${urlToPageFile(mod.menuPath!)} existiert nicht. Jeder Kunde bekaeme einen Menuepunkt, der ins 404 fuehrt. Entweder die Seite bauen oder "${mod.key}" in src/lib/modules/registry.ts mit "unbuilt: true" markieren.`,
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
