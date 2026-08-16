import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  MODULE_PATHS,
  coreModulesWithPaths,
  moduleForPath,
  pathsForModule,
} from '@/lib/modules/module-map';
import { MODULES, MODULES_BY_KEY, type ModuleKey } from '@/lib/modules/registry';
import { FEATURE_KEYS, FEATURE_MODULES, featureForPath } from '@/lib/tenant/feature-map';
import { NAV_GROUPS, MOBILE_NAV_ITEMS } from '@/components/layout/nav-config';

/**
 * Sprint 117: Das Modul-Gate entscheidet, ob eine abgeschaltete Funktion
 * wirklich weg ist. Zwei Fehlerrichtungen, beide teuer:
 *
 *   zu eng — eine Route bleibt offen, obwohl der Inhaber das Modul
 *            abgeschaltet hat (der Zustand vor diesem Sprint: der
 *            Menuepunkt verschwand, die URL blieb tippbar)
 *   zu weit — eine fremde Route faellt mit unter das Gate, und der Mandant
 *            verliert eine Funktion, die er nie abgeschaltet hat
 *
 * Beides ist reine Konfiguration und damit hier pruefbar. Im Browser waere
 * dafuer ein Mandant mit abgeschaltetem Modul noetig, den man von Hand
 * herstellen muesste — und danach wieder zuruecksetzen.
 */

const APP_DIR = join(process.cwd(), 'src', 'app', '(app)');

/**
 * Routen im Staff-Bereich, die bewusst an kein abschaltbares Modul haengen.
 * Das sind die Kernrouten (immer da) und die Konto-/Abo-/Rechts-Seiten, die
 * jeder Nutzer erreichen koennen muss — auch der eines Mandanten, der alle
 * Fachmodule abgeschaltet hat. Insbesondere `/settings/tenant`: dort legt
 * man die Schalter wieder um.
 */
const UNGATED_PREFIXES: readonly string[] = [
  '/dashboard',
  '/notifications',
  '/hilfe',
  '/settings/account',
  '/settings/audit',
  '/settings/emails',
  '/settings/notifications',
  '/settings/privacy',
  '/settings/subscription',
  '/settings/tenant',
  '/settings/users',
];

/** Alle Seiten-Routen unter src/app/(app), Route-Groups herausgerechnet. */
function collectAppRoutes(dir: string = APP_DIR): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      routes.push(...collectAppRoutes(full));
      continue;
    }
    if (entry.name !== 'page.tsx') continue;
    const segments = relative(APP_DIR, dir)
      .split(sep)
      .filter((s) => s.length > 0 && !s.startsWith('(')); // (app), (group) tragen keinen Pfad bei
    routes.push(`/${segments.join('/')}`);
  }
  return routes;
}

const APP_ROUTES = collectAppRoutes();

describe('moduleForPath', () => {
  it('trifft die Route selbst und alles darunter', () => {
    expect(moduleForPath('/keys')).toBe('keys');
    expect(moduleForPath('/keys/neu')).toBe('keys');
    expect(moduleForPath('/keys/abc-123/edit')).toBe('keys');
  });

  it('haelt an der Segmentgrenze', () => {
    expect(moduleForPath('/keys-export')).toBeNull();
    expect(moduleForPath('/meterstand')).toBeNull();
    expect(moduleForPath('/reportsomething')).toBeNull();
  });

  it('deckt die Nebenaeste eines Moduls mit ab', () => {
    // Genau die Routen, die eine Ableitung aus `menuPath` verloren haette —
    // sie haben keinen eigenen Menuepunkt und wuerden deshalb auch niemandem
    // auffallen, wenn sie offen blieben.
    expect(moduleForPath('/time-corrections')).toBe('time_tracking');
    expect(moduleForPath('/time-corrections/abc')).toBe('time_tracking');
    expect(moduleForPath('/checklist-runs/abc')).toBe('checklists');
    expect(moduleForPath('/qr/print')).toBe('qr_codes');
    expect(moduleForPath('/qr/property/abc')).toBe('qr_codes');
  });

  it('trennt die beiden Zeit-Routen nicht von ihrem gemeinsamen Modul', () => {
    expect(moduleForPath('/time-tracking')).toBe('time_tracking');
    expect(moduleForPath('/time-tracking/team')).toBe('time_tracking');
  });

  it('trifft die Automatisierungen, aber nicht die uebrigen Einstellungen', () => {
    expect(moduleForPath('/settings/automations')).toBe('automations');
    expect(moduleForPath('/settings/automations/r1/runs/x')).toBe('automations');
    for (const path of UNGATED_PREFIXES) {
      expect(moduleForPath(path), `${path} darf kein Modul-Gate ausloesen`).toBeNull();
    }
  });

  it('laesst die Kernrouten ungesperrt — sonst sperrt sich ein Mandant selbst aus', () => {
    // /settings/tenant ist der Ort, an dem Module wieder eingeschaltet
    // werden. Faellt der unter ein Gate, gibt es keinen Weg zurueck.
    expect(moduleForPath('/settings/tenant')).toBeNull();
    expect(moduleForPath('/dashboard')).toBeNull();
  });

  it('vertraegt Randformen des Pfads', () => {
    expect(moduleForPath('/keys/')).toBe('keys');
    expect(moduleForPath('/keys?q=1')).toBe('keys');
    expect(moduleForPath('')).toBeNull();
    expect(moduleForPath('/')).toBeNull();
  });
});

describe('Konsistenz mit der Modul-Registry', () => {
  it('sanity: die Tabelle ist nicht leer und die Routen wurden gefunden', () => {
    expect(Object.keys(MODULE_PATHS).length).toBeGreaterThan(10);
    expect(APP_ROUTES.length).toBeGreaterThan(50);
  });

  it('jeder Modul-Key in MODULE_PATHS existiert in der Registry', () => {
    const known = new Set<string>(MODULES.map((m) => m.key));
    for (const key of Object.keys(MODULE_PATHS)) {
      expect(
        known.has(key),
        `MODULE_PATHS nennt "${key}", das in MODULES nicht existiert. Das Gate liefe ins Leere — der Key steht in keinem tenant_modules-Eintrag.`,
      ).toBe(true);
    }
  });

  it('kein Kern-Modul bewacht eine Route', () => {
    // Ein Kern-Modul kann nicht abgeschaltet werden. Stuende es hier, waere
    // der Eintrag entweder wirkungslos oder — schlimmer — eine Sperre, die
    // niemand mehr loesen kann.
    expect(
      coreModulesWithPaths(),
      'Kern-Module gehoeren nicht in MODULE_PATHS: sie sind per Definition immer aktiv.',
    ).toEqual([]);
  });

  it('jedes abschaltbare Modul mit menuPath wird auch gesperrt', () => {
    // Sonst blendet die Navigation den Eintrag aus, die Route bleibt aber per
    // URL offen — genau die halbe Massnahme, die dieser Sprint behebt.
    for (const mod of MODULES) {
      if (mod.core || !mod.menuPath) continue;
      expect(
        moduleForPath(mod.menuPath),
        `Modul "${mod.key}" zeigt auf ${mod.menuPath}, aber dieser Pfad faellt unter kein Modul-Gate. Eintrag in MODULE_PATHS nachtragen.`,
      ).toBe(mod.key);
    }
  });

  it('jeder Nav-Eintrag mit abschaltbarem Modul zeigt auf eine Route desselben Moduls', () => {
    const navItems = [...NAV_GROUPS.flatMap((g) => [...g.items]), ...MOBILE_NAV_ITEMS];
    for (const item of navItems) {
      if (!item.module || MODULES_BY_KEY[item.module]?.core) continue;
      expect(
        moduleForPath(item.href),
        `Der Menuepunkt "${item.labelDe}" (${item.href}) verschwindet, wenn Modul "${item.module}" aus ist — die Route dahinter faellt aber unter ${moduleForPath(item.href) ?? 'kein'} Gate.`,
      ).toBe(item.module);
    }
  });

  it('jede Seite unter (app) ist entweder gesperrt oder ausdruecklich ungesperrt', () => {
    // Der eigentliche Waechter: eine neue Route eines abschaltbaren Moduls
    // faellt hier auf, bevor sie ungeschuetzt live geht.
    for (const route of APP_ROUTES) {
      if (moduleForPath(route)) continue;
      const ungated = UNGATED_PREFIXES.some((p) => route === p || route.startsWith(`${p}/`));
      expect(
        ungated,
        `Die Seite "${route}" haengt an keinem Modul-Gate und steht nicht in UNGATED_PREFIXES. Entweder gehoert ihr Praefix in MODULE_PATHS (dann ist sie mit ihrem Modul abschaltbar), oder sie ist bewusst immer erreichbar — dann hier eintragen.`,
      ).toBe(true);
    }
  });

  it('jeder Eintrag in UNGATED_PREFIXES entspricht einer echten Seite', () => {
    // Sonst verrottet die Liste zur Tarnkappe: ein Praefix, den es nicht mehr
    // gibt, deckt spaeter vielleicht eine ganz andere Route.
    for (const prefix of UNGATED_PREFIXES) {
      expect(
        APP_ROUTES.some((r) => r === prefix || r.startsWith(`${prefix}/`)),
        `UNGATED_PREFIXES nennt "${prefix}", aber unter src/app/(app) gibt es dazu keine Seite.`,
      ).toBe(true);
    }
  });
});

describe('Das Gate haengt tatsaechlich im Layout', () => {
  /**
   * Die Tabelle oben kann noch so gut sein — ohne Aufrufer ist sie genau das,
   * was `isModuleEnabled()` vor diesem Sprint war: Code, der aussieht, als
   * gaebe es eine Pruefung. Ein Browser-Test dafuer braucht einen Mandanten
   * mit abgeschaltetem Modul und einen Staff-Login; bis es den gibt, haelt
   * diese Pruefung die Verdrahtung fest.
   */
  const layout = readFileSync(
    join(process.cwd(), 'src', 'app', '(app)', 'layout.tsx'),
    'utf8',
  );

  it('ruft moduleForPath auf und antwortet mit notFound()', () => {
    expect(layout).toMatch(/from '@\/lib\/modules\/module-map'/);
    expect(layout).toContain('moduleForPath(pathname)');
    expect(layout).toContain('notFound()');
  });

  it('prueft den Tarif vor dem Modul', () => {
    // Andersherum saehe ein Kunde mit zu kleinem Tarif ein 404 statt der
    // Seite, die ihm sagt, welcher Tarif die Funktion enthaelt.
    const featureGate = layout.indexOf('featureForPath(pathname)');
    const moduleGate = layout.indexOf('moduleForPath(pathname)');
    expect(featureGate).toBeGreaterThan(-1);
    expect(moduleGate).toBeGreaterThan(-1);
    expect(
      featureGate,
      'Das Tarif-Gate muss im Layout vor dem Modul-Gate stehen.',
    ).toBeLessThan(moduleGate);
  });

  it('haelt das Modul-Gate hinter dem Abo-Gate', () => {
    // Ein Mandant, dessen Testphase abgelaufen ist, gehoert auf
    // /zahlung-erforderlich — nicht auf ein 404.
    const subscriptionGate = layout.indexOf('evaluateSubscriptionAccess');
    expect(subscriptionGate).toBeGreaterThan(-1);
    expect(subscriptionGate).toBeLessThan(layout.indexOf('moduleForPath(pathname)'));
  });
});

describe('Zusammenspiel mit dem Tarif-Gate', () => {
  it('jede Route eines tarifgebundenen Moduls faellt zuerst unter das Tarif-Gate', () => {
    /**
     * Reihenfolge im Layout: erst Tarif, dann Modul. Ein tarifgesperrtes
     * Modul faellt naemlich auch aus `getAvailableModules()` heraus — ohne
     * den Tarif-Treffer davor bekaeme der Kunde ein 404 statt der Seite, die
     * ihm erklaert, welcher Tarif die Funktion enthaelt. Das 404 waere nicht
     * unsicher, aber es sieht aus wie ein Fehler und kostet einen Support-Fall.
     */
    for (const feature of FEATURE_KEYS) {
      for (const moduleKey of FEATURE_MODULES[feature]) {
        for (const path of pathsForModule(moduleKey)) {
          expect(
            featureForPath(path),
            `Modul "${moduleKey}" haengt an Tarif-Feature "${feature}" und bewacht ${path} — dieser Pfad faellt aber unter kein Tarif-Gate. Der Kunde saehe dort ein 404 statt der Erklaerung. Eintrag in FEATURE_PATHS nachtragen.`,
          ).toBe(feature);
        }
      }
    }
  });

  it('kein Pfad des Tarif-Gates gehoert zu einem anderen Modul als erwartet', () => {
    // Gegenrichtung: was der Tarif sperrt, muss demselben Modul gehoeren.
    // Sonst sperrt das eine Gate mehr als das andere, und welche Meldung der
    // Kunde sieht, haengt davon ab, welches zuerst laeuft.
    for (const feature of FEATURE_KEYS) {
      for (const moduleKey of FEATURE_MODULES[feature]) {
        for (const path of pathsForModule(moduleKey)) {
          expect(moduleForPath(path) as ModuleKey | null).toBe(moduleKey);
        }
      }
    }
  });
});
