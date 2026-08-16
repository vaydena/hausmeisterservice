import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FEATURE_KEYS,
  FEATURE_LABEL,
  FEATURE_MODULES,
  FEATURE_PATHS,
  featureForModule,
  featureForPath,
  lockedModules,
  parseFeatureKey,
  type FeatureKey,
} from '@/lib/tenant/feature-map';
import { MODULES, type ModuleKey } from '@/lib/modules/registry';
import { NAV_GROUPS, MOBILE_NAV_ITEMS } from '@/components/layout/nav-config';

/**
 * Sprint 114: Die Plan-Feature-Gates entscheiden, was ein zahlender Kunde
 * benutzen darf. Zwei Fehlerrichtungen, beide teuer:
 *
 *   zu weit  — eine fremde Route faellt mit unter das Gate, und der Kunde
 *              verliert Funktionen, fuer die er bezahlt hat
 *   zu eng   — eine Route bleibt offen, und der Starter-Tarif liefert den
 *              vollen Funktionsumfang aus (der Zustand vor diesem Sprint)
 *
 * Die Tabelle ist reine Konfiguration, also genau hier pruefbar — im
 * Browser waere dafuer ein Mandant mit gebuchtem Plan noetig, den es
 * derzeit gar nicht gibt.
 */

const ALL_ON: Record<FeatureKey, boolean> = {
  gps: true,
  portal: true,
  vehicles: true,
  automations: true,
  api: true,
};

function only(...off: FeatureKey[]): Record<FeatureKey, boolean> {
  const out = { ...ALL_ON };
  for (const key of off) out[key] = false;
  return out;
}

describe('featureForPath', () => {
  it('trifft die Route selbst und alles darunter', () => {
    expect(featureForPath('/vehicles')).toBe('vehicles');
    expect(featureForPath('/vehicles/neu')).toBe('vehicles');
    expect(featureForPath('/vehicles/abc-123/edit')).toBe('vehicles');
  });

  it('haelt an der Segmentgrenze — sonst sperrt das Gate irgendwann fremde Routen mit', () => {
    // Ein `startsWith('/vehicles')` ohne Grenze wuerde diese Pfade
    // mitnehmen. Der Kunde saehe dann eine Sperrseite fuer eine Funktion,
    // die mit dem Fuhrpark nichts zu tun hat.
    expect(featureForPath('/vehicles-export')).toBeNull();
    expect(featureForPath('/vehiclesomething')).toBeNull();
    expect(featureForPath('/tourshop')).toBeNull();
  });

  it('deckt Touren mit ab — der Tarif sagt "GPS-Tracking + Touren" zu', () => {
    expect(featureForPath('/tours')).toBe('gps');
    expect(featureForPath('/tours/t1')).toBe('gps');
    expect(featureForPath('/map')).toBe('gps');
  });

  it('trifft die Automatisierungen, aber nicht die uebrigen Einstellungen', () => {
    expect(featureForPath('/settings/automations')).toBe('automations');
    expect(featureForPath('/settings/automations/r1/runs/x')).toBe('automations');
    expect(featureForPath('/settings/tenant')).toBeNull();
    expect(featureForPath('/settings/subscription')).toBeNull();
    expect(featureForPath('/settings/account')).toBeNull();
  });

  it('laesst die Kernrouten ungesperrt', () => {
    for (const path of [
      '/dashboard',
      '/work-orders',
      '/properties',
      '/time-tracking',
      '/billing',
      '/reports',
      '/messages',
      '/keys',
      '/meters',
      '/materials',
    ]) {
      expect(featureForPath(path), `${path} darf kein Tarif-Gate ausloesen`).toBeNull();
    }
  });

  it('sperrt das Portal nicht ueber diese Tabelle — dort greift das Portal-Layout', () => {
    expect(featureForPath('/portal/dashboard')).toBeNull();
    expect(FEATURE_PATHS.portal).toEqual([]);
  });

  it('vertraegt Randformen des Pfads', () => {
    expect(featureForPath('/vehicles/')).toBe('vehicles');
    expect(featureForPath('/vehicles?x=1')).toBe('vehicles');
    expect(featureForPath('')).toBeNull();
    expect(featureForPath('/')).toBeNull();
  });
});

describe('lockedModules', () => {
  it('sperrt nichts, wenn der Tarif alles abdeckt', () => {
    expect(lockedModules(ALL_ON).size).toBe(0);
  });

  it('sperrt Touren zusammen mit GPS', () => {
    const locked = lockedModules(only('gps'));
    expect(locked.has('gps')).toBe(true);
    expect(locked.has('tours')).toBe(true);
    expect(locked.has('vehicles')).toBe(false);
  });

  it('sperrt beide Portale ueber das eine Feature', () => {
    const locked = lockedModules(only('portal'));
    expect(locked.has('resident_portal')).toBe(true);
    expect(locked.has('owner_portal')).toBe(true);
  });

  it('laesst die Kernmodule und den Rest der Fachmodule unberuehrt', () => {
    // Starter: alles aus. Was dann noch uebrig bleibt, ist der Umfang, den
    // der guenstigste Tarif verspricht — Auftraege, Objekte, Zeiterfassung.
    const locked = lockedModules(only('gps', 'portal', 'vehicles', 'automations', 'api'));
    for (const key of [
      'work_orders',
      'properties',
      'time_tracking',
      'billing',
      'reporting',
      'messaging',
      'keys',
      'meters',
      'materials',
      'core.dashboard',
    ] satisfies ModuleKey[]) {
      expect(locked.has(key), `${key} darf vom Tarif nicht gesperrt werden`).toBe(false);
    }
  });
});

describe('featureForModule', () => {
  it('ist die Umkehrung von FEATURE_MODULES', () => {
    for (const feature of FEATURE_KEYS) {
      for (const moduleKey of FEATURE_MODULES[feature]) {
        expect(featureForModule(moduleKey)).toBe(feature);
      }
    }
  });

  it('liefert null fuer Module ohne Tarif-Bindung', () => {
    expect(featureForModule('work_orders')).toBeNull();
    expect(featureForModule('core.dashboard')).toBeNull();
  });
});

describe('parseFeatureKey', () => {
  it('nimmt bekannte Keys an', () => {
    for (const key of FEATURE_KEYS) expect(parseFeatureKey(key)).toBe(key);
  });

  it('weist alles andere ab — der Wert kommt aus der URL', () => {
    for (const bad of ['', 'GPS', 'toString', 'constructor', '__proto__', 'gps ', null, undefined]) {
      expect(parseFeatureKey(bad)).toBeNull();
    }
  });
});

describe('Konsistenz mit Registry und Nav', () => {
  it('jeder Modul-Key in FEATURE_MODULES existiert in der Registry', () => {
    const known = new Set<string>(MODULES.map((m) => m.key));
    for (const feature of FEATURE_KEYS) {
      for (const moduleKey of FEATURE_MODULES[feature]) {
        expect(
          known.has(moduleKey),
          `FEATURE_MODULES.${feature} nennt "${moduleKey}", das in MODULES nicht existiert. lockedModules() wuerde den Key nie treffen — das Gate liefe ins Leere.`,
        ).toBe(true);
      }
    }
  });

  it('kein Kern-Modul haengt an einem Tarif-Feature', () => {
    // Ein gesperrtes Kern-Modul hiesse: Dashboard oder Benutzerverwaltung
    // verschwinden. Das waere kein Feature-Gate mehr, sondern eine Sperre.
    for (const mod of MODULES.filter((m) => m.core)) {
      expect(featureForModule(mod.key), `Kern-Modul ${mod.key} darf nicht tarifgebunden sein`).toBeNull();
    }
  });

  it('jedes tarifgebundene Modul mit menuPath ist auch ueber FEATURE_PATHS gesperrt', () => {
    // Sonst blendet die Navigation den Eintrag aus, die Route bleibt aber
    // per URL offen — genau die halbe Massnahme, die dieser Sprint behebt.
    for (const feature of FEATURE_KEYS) {
      if (feature === 'portal') continue; // eigener Gate im Portal-Layout
      for (const moduleKey of FEATURE_MODULES[feature]) {
        const menuPath = MODULES.find((m) => m.key === moduleKey)?.menuPath;
        if (!menuPath) continue;
        expect(
          featureForPath(menuPath),
          `Modul "${moduleKey}" haengt an Feature "${feature}" und zeigt auf ${menuPath} — dieser Pfad faellt aber unter kein Gate. Eintrag in FEATURE_PATHS nachtragen.`,
        ).toBe(feature);
      }
    }
  });

  it('jeder Pfad in FEATURE_PATHS gehoert zu einem Nav-Eintrag oder einem Modul', () => {
    const navHrefs = new Set<string>([
      ...NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)),
      ...MOBILE_NAV_ITEMS.map((i) => i.href),
    ]);
    const menuPaths = new Set<string>(
      MODULES.map((m) => m.menuPath).filter((p): p is string => Boolean(p)),
    );
    for (const feature of FEATURE_KEYS) {
      for (const path of FEATURE_PATHS[feature]) {
        expect(
          navHrefs.has(path) || menuPaths.has(path),
          `FEATURE_PATHS.${feature} sperrt "${path}", aber weder Nav noch Modul-Registry kennen diesen Pfad. Vermutlich ein Tippfehler — das Gate greift dann nirgends.`,
        ).toBe(true);
      }
    }
  });

  it('jedes Feature hat ein Label — es steht auf der Sperrseite', () => {
    for (const feature of FEATURE_KEYS) {
      expect(FEATURE_LABEL[feature]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('Deckung mit dem Tarif-Seed', () => {
  /**
   * Die Feature-Keys sind kein internes Vokabular: sie stehen so im
   * jsonb der Plaene. Ein Tippfehler auf einer der beiden Seiten faellt
   * sonst erst auf, wenn ein Kunde die Funktion vermisst — oder wenn er
   * sie behaelt, obwohl sein Tarif sie nicht enthaelt.
   */
  const seed = readFileSync(
    join(
      process.cwd(),
      'supabase',
      'migrations',
      '20260812081357_seed_platform_subscription_plans.sql',
    ),
    'utf8',
  );

  for (const feature of FEATURE_KEYS) {
    it(`Feature "${feature}" kommt im Plan-Seed vor`, () => {
      expect(seed.includes(`"${feature}"`)).toBe(true);
    });
  }

  it('der Seed nennt kein Feature, das der Code nicht kennt', () => {
    const inSeed = new Set(
      [...seed.matchAll(/"([a-z_]+)":(?:true|false)/g)].map((m) => m[1] as string),
    );
    for (const key of inSeed) {
      expect(
        (FEATURE_KEYS as readonly string[]).includes(key),
        `Der Plan-Seed schaltet "${key}", aber FeatureKey kennt den Wert nicht. getEnabledFeatures() ignoriert ihn stillschweigend — der Tarif verspricht dann etwas, das nirgends durchgesetzt wird.`,
      ).toBe(true);
    }
  });
});
