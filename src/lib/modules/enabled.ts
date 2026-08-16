import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { CORE_MODULE_KEYS, type ModuleKey } from '@/lib/modules/registry';
import { getEnabledFeatures } from '@/lib/tenant/features';
import { lockedModules } from '@/lib/tenant/feature-map';

/**
 * Effektive Modul-Aktivierung für den aktuellen Tenant.
 * Core-Module sind immer aktiv; alles andere kommt aus `public.tenant_modules`.
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
  );

  const enabled = new Set<ModuleKey>(CORE_MODULE_KEYS);
  for (const row of rows) {
    if (row.enabled) enabled.add(row.module_key as ModuleKey);
  }
  return enabled;
});

/*
 * Sprint 117: Hier stand `isModuleEnabled(tenantId, moduleKey)`. Die Funktion
 * hatte seit ihrer Entstehung keinen einzigen Aufrufer und sah trotzdem so
 * aus, als gaebe es irgendwo eine Modul-Pruefung — die gab es nicht.
 *
 * Das Gate sitzt jetzt im Layout unter `src/app/(app)/layout.tsx` und prueft
 * gegen das Set aus `getAvailableModules()`, das dort ohnehin fuer die
 * Navigation geladen wird. Ein zweiter Einzelabruf daneben waere nur eine
 * weitere Stelle, an der jemand vergessen kann, ihn aufzurufen.
 */

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
