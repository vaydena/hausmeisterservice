import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CORE_MODULE_KEYS, type ModuleKey } from '@/lib/modules/registry';

/**
 * Effektive Modul-Aktivierung für den aktuellen Tenant.
 * Core-Module sind immer aktiv; alles andere kommt aus `public.tenant_modules`.
 */
export const getEnabledModules = cache(async (tenantId: string): Promise<Set<ModuleKey>> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('tenant_modules')
    .select('module_key, enabled')
    .eq('tenant_id', tenantId);

  const enabled = new Set<ModuleKey>(CORE_MODULE_KEYS);
  for (const row of data ?? []) {
    if (row.enabled) enabled.add(row.module_key as ModuleKey);
  }
  return enabled;
});

export async function isModuleEnabled(tenantId: string, moduleKey: ModuleKey): Promise<boolean> {
  const enabled = await getEnabledModules(tenantId);
  return enabled.has(moduleKey);
}
