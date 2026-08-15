import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import type { PermissionKey } from '@/lib/permissions/registry';

/**
 * Alle Permissions, die der aktuelle User im aktuellen Tenant hat
 * (tenant-weit UND objekt-scoped). Für UI-Filter reicht das flache Set —
 * scope-basierte Sichten prüfen zusätzlich pro Datensatz.
 *
 * Sprint 104: Die beiden Queries werden ausgepackt statt destrukturiert.
 * Ein leeres Set ist hier naemlich keine harmlose leere Liste, sondern eine
 * Aussage: "dieser User darf nichts." Bei einem Query-Fehler lieferte das
 * alte `?? []` genau diese Aussage — der Mitarbeiter sah eine Oberflaeche
 * ohne Navigation und ohne Aktionen und musste annehmen, sein Chef habe ihm
 * ueber Nacht die Rechte entzogen. Wer dem nachgeht, sucht im Rollen-Editor,
 * wo alles korrekt eingetragen ist. Eine Fehlerseite ist ungemuetlich, aber
 * sie zeigt wenigstens auf die richtige Ursache.
 */
export const getEffectivePermissions = cache(
  async (userId: string, tenantId: string): Promise<Set<PermissionKey>> => {
    const supabase = await createSupabaseServerClient();
    const assignments = unwrapRows(
      await supabase
        .from('user_roles')
        .select('role_id')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId),
      'Berechtigungen: Rollenzuweisungen',
    );

    const roleIds = [...new Set(assignments.map((a) => a.role_id))];
    if (roleIds.length === 0) return new Set();

    const perms = unwrapRows(
      await supabase.from('role_permissions').select('permission_key').in('role_id', roleIds),
      'Berechtigungen: Rechte der zugewiesenen Rollen',
    );

    return new Set<PermissionKey>(perms.map((p) => p.permission_key));
  },
);

export async function hasPermission(
  userId: string,
  tenantId: string,
  permissionKey: PermissionKey,
): Promise<boolean> {
  const perms = await getEffectivePermissions(userId, tenantId);
  return perms.has(permissionKey);
}
