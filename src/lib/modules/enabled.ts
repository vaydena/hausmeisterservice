import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import {
  CORE_MODULE_KEYS,
  DEFAULT_ON_MODULE_KEYS,
  isModuleEnabledByRows,
  type ModuleKey,
  type ModuleToggleRow,
} from '@/lib/modules/registry';
import { getEnabledFeatures } from '@/lib/tenant/features';
import { lockedModules } from '@/lib/tenant/feature-map';

/**
 * Effektive Modul-Aktivierung für den aktuellen Tenant.
 * Core-Module sind immer aktiv; alles andere entscheidet
 * `isModuleEnabledByRows` aus `public.tenant_modules`.
 *
 * Sprint 104: Bei einem Query-Fehler blieb frueher nur die Core-Liste uebrig.
 * Das Ergebnis ist kein Fehler, sondern eine plausible Behauptung — "dieser
 * Mandant hat keine Zusatzmodule gebucht" — und die Navigation verliert
 * daraufhin schlagartig jeden Eintrag, den der Kunde eingerichtet hat.
 */
export const getEnabledModules = cache(async (tenantId: string): Promise<Set<ModuleKey>> => {
  const supabase = await createSupabaseServerClient();
  const rows = unwrapRows(
    await supabase.from('tenant_modules').select('module_key, enabled').eq('tenant_id', tenantId),
    'Aktive Module des Mandanten',
  ) as ModuleToggleRow[];

  const enabled = new Set<ModuleKey>(CORE_MODULE_KEYS);

  for (const key of DEFAULT_ON_MODULE_KEYS) {
    if (isModuleEnabledByRows(key, rows)) enabled.add(key);
  }

  // Ungebaute Module stehen nicht im Default, koennen aber eine aktive
  // Zeile aus der Zeit vor dem Signup-Riegel haben (Sprint 131). Die bleibt
  // hier sichtbar, damit Einstellungen → Mandant sie weiterhin ausweisen
  // kann; `getAvailableModules` und die Navigation filtern sie ohnehin.
  for (const row of rows) {
    if (row.enabled) enabled.add(row.module_key as ModuleKey);
  }

  return enabled;
});

/**
 * Sprint 114: Module, die der Mandant aktiviert hat UND die sein Tarif
 * abdeckt. Das ist die Menge, aus der Navigation und Dashboard gebaut werden.
 *
 * Bewusst getrennt von `getEnabledModules`: die Einstellungen->Mandant-Seite
 * braucht weiterhin den rohen Schalterzustand, um ein tarifgesperrtes Modul
 * ueberhaupt als "im Tarif nicht enthalten" ausweisen zu koennen. Wuerde sie
 * dieselbe reduzierte Menge lesen, saehe der Inhaber dort nur einen Schalter,
 * den er umlegen kann und der nichts bewirkt.
 */
export const getAvailableModules = cache(async (tenantId: string): Promise<Set<ModuleKey>> => {
  const [enabled, features] = await Promise.all([
    getEnabledModules(tenantId),
    getEnabledFeatures(tenantId),
  ]);

  const locked = lockedModules(features);
  const available = new Set<ModuleKey>();
  for (const key of enabled) if (!locked.has(key)) available.add(key);
  return available;
});

/**
 * Sprint 117: Einzelabfrage fuer Stellen, die auf ein bestimmtes Modul
 * verlinken, ohne selbst dazuzugehoeren — die QR-Buttons auf Objekten,
 * Schluesseln und Zaehlern zum Beispiel.
 *
 * Vorgaenger war `isModuleEnabled()`, das den rohen Schalterzustand las und
 * keinen einzigen Aufrufer hatte. Der Unterschied ist nicht kosmetisch: das
 * Routen-Gate im Layout prueft gegen `getAvailableModules()`. Wer hier den
 * rohen Zustand liest, zeigt einen Button, der ins 404 fuehrt, sobald der
 * Tarif das Modul sperrt.
 *
 * `getAvailableModules` ist `cache`d — der Aufruf kostet innerhalb eines
 * Requests nichts, das Layout hat die Menge ohnehin schon geladen.
 */
export async function isModuleAvailable(
  tenantId: string,
  moduleKey: ModuleKey,
): Promise<boolean> {
  return (await getAvailableModules(tenantId)).has(moduleKey);
}
