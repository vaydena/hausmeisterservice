import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { CORE_MODULE_KEYS, type ModuleKey } from '@/lib/modules/registry';

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

export async function isModuleEnabled(tenantId: string, moduleKey: ModuleKey): Promise<boolean> {
  const enabled = await getEnabledModules(tenantId);
  return enabled.has(moduleKey);
}
