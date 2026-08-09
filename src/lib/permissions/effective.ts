import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { PermissionKey } from '@/lib/permissions/registry';

/**
 * Alle Permissions, die der aktuelle User im aktuellen Tenant hat
 * (tenant-weit UND objekt-scoped). Für UI-Filter reicht das flache Set —
 * scope-basierte Sichten prüfen zusätzlich pro Datensatz.
 */
export const getEffectivePermissions = cache(
  async (userId: string, tenantId: string): Promise<Set<PermissionKey>> => {
    const supabase = await createSupabaseServerClient();
    const { data: assignments } = await supabase
      .from('user_roles')
      .select('role_id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId);

    const roleIds = [...new Set((assignments ?? []).map((a) => a.role_id))];
    if (roleIds.length === 0) return new Set();

    const { data: perms } = await supabase
      .from('role_permissions')
      .select('permission_key')
      .in('role_id', roleIds);

    return new Set<PermissionKey>((perms ?? []).map((p) => p.permission_key));
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
