/**
 * Sprint 114: Was ein Plan-Feature konkret sperrt.
 *
 * `features.ts` beantwortet die Frage "ist Feature X im gebuchten Tarif?".
 * Diese Datei beantwortet die Anschlussfrage, ohne die das nichts bewirkt:
 * WELCHE Route und WELCHES Modul haengen an Feature X. Bis Sprint 113 gab es
 * darauf keine Antwort im Code — `features.ts` hatte keinen einzigen
 * Importeur, und jeder Mandant konnte unabhaengig vom Tarif alles benutzen.
 *
 * Bewusst frei von Datenbank und `server-only`: die Zuordnung ist reine
 * Konfiguration und wird in tests/feature-map.test.ts direkt geprueft.
 *
 * Die Feature-Namen sind kein internes Vokabular, sondern stehen so auf
 * /preise und in Einstellungen->Abo. Wer sie hier aendert, aendert eine
 * Zusage an zahlende Kunden — die Labels unten sind mit der oeffentlichen
 * Preisseite (src/app/preise/page.tsx) und dem Seed der Plaene
 * (supabase/migrations/20260812081357_seed_platform_subscription_plans.sql)
 * abgeglichen.
 */
import type { ModuleKey } from '@/lib/modules/registry';
import { normalizeRoutePath, pathHasPrefix } from '@/lib/routing/path-prefix';

export type FeatureKey = 'gps' | 'portal' | 'vehicles' | 'automations' | 'api';

export const FEATURE_KEYS: readonly FeatureKey[] = [
  'gps',
  'portal',
  'vehicles',
  'automations',
  'api',
] as const;

/** Anzeigename — landet auf der Sperrseite vor dem Nutzer. */
export const FEATURE_LABEL: Record<FeatureKey, string> = {
  gps: 'GPS-Tracking & Touren',
  portal: 'Bewohner-/Eigentümerportal',
  vehicles: 'Fuhrpark',
  automations: 'Automatisierungs-Regeln',
  api: 'API-Zugang',
};

/**
 * Module, die ohne das Feature nicht benutzbar sind. Der Mandant kann sie
 * unter Einstellungen->Mandant weiterhin sehen, aber nicht mehr scharf
 * schalten — sonst stuende dort "Aktiv" ueber einer Route, die den Nutzer
 * wegleitet.
 *
 * `tours` haengt an `gps`, weil der Tarif-Seed genau das zusagt:
 * "gps — GPS-Tracking + Touren". Auf /preise steht derselbe Satz.
 */
export const FEATURE_MODULES: Record<FeatureKey, readonly ModuleKey[]> = {
  gps: ['gps', 'tours'],
  portal: ['resident_portal', 'owner_portal'],
  vehicles: ['vehicles'],
  automations: ['automations'],
  // Eine oeffentliche API gibt es noch nicht — kein Modul, keine Route.
  api: [],
};

/**
 * Routen-Praefixe im Staff-Bereich, die das Feature voraussetzen.
 *
 * `portal` steht hier bewusst leer: das Bewohnerportal ist eine eigene
 * Route-Group mit eigenem Layout und eigenem Nutzerkreis. Dort greift der
 * Gate im Portal-Layout, nicht ueber diese Tabelle.
 */
export const FEATURE_PATHS: Record<FeatureKey, readonly string[]> = {
  // Sprint 139: '/map' ist raus — die Route wurde nie gebaut, das Gate
  // sperrte also eine Seite, die es nicht gibt. /tours bleibt: die
  // Tourenplanung ist gebaut und im Tarif enthalten.
  gps: ['/tours'],
  portal: [],
  vehicles: ['/vehicles'],
  automations: ['/settings/automations'],
  api: [],
};

/**
 * Welches Feature deckt diesen Pfad ab — oder keines?
 *
 * Der Praefix-Vergleich haelt an der Segmentgrenze und liegt seit Sprint 117
 * in `@/lib/routing/path-prefix` — dasselbe Stueck Logik entscheidet auch
 * ueber das Modul-Gate, und die beiden duerfen sich ueber einen Pfad nicht
 * uneinig sein.
 */
export function featureForPath(pathname: string): FeatureKey | null {
  const path = normalizeRoutePath(pathname);
  if (!path) return null;

  for (const feature of FEATURE_KEYS) {
    for (const prefix of FEATURE_PATHS[feature]) {
      if (pathHasPrefix(path, prefix)) return feature;
    }
  }
  return null;
}

/** Module, die der aktuelle Tarif sperrt. */
export function lockedModules(features: Record<FeatureKey, boolean>): Set<ModuleKey> {
  const locked = new Set<ModuleKey>();
  for (const feature of FEATURE_KEYS) {
    if (features[feature]) continue;
    for (const moduleKey of FEATURE_MODULES[feature]) locked.add(moduleKey);
  }
  return locked;
}

/** Das Feature, an dem dieses Modul haengt — oder keines. */
export function featureForModule(moduleKey: ModuleKey): FeatureKey | null {
  for (const feature of FEATURE_KEYS) {
    if (FEATURE_MODULES[feature].includes(moduleKey)) return feature;
  }
  return null;
}

/** Aus `?feature=` kommt beliebiger Text — nur bekannte Keys durchlassen. */
export function parseFeatureKey(value: string | null | undefined): FeatureKey | null {
  if (!value) return null;
  return (FEATURE_KEYS as readonly string[]).includes(value) ? (value as FeatureKey) : null;
}
