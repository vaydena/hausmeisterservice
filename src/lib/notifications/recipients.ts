import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Löst employee_id → user_id auf. `null`, wenn Mitarbeiter nicht existiert oder
 * kein User-Konto verknüpft ist.
 */
export async function resolveEmployeeUserId(employeeId: string | null): Promise<string | null> {
  if (!employeeId) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('employees')
    .select('user_id')
    .eq('id', employeeId)
    .maybeSingle();
  return data?.user_id ?? null;
}

/**
 * Alle aktiven Mitglieder des aktuellen Tenants, die eine bestimmte Permission
 * über eine ihrer Rollen haben. Wird für Broadcasts genutzt (Meldungen an alle
 * Objektleiter etc.).
 *
 * Nur tenant-weite Zuordnung. Property-scoped Permissions werden hier nicht
 * berücksichtigt — für eine feinere Segmentierung müssten wir zusätzlich
 * user_roles.scope_type/scope_id einbeziehen. Für den ersten Cut reicht der
 * flache Set.
 */
export async function listUsersWithPermission(
  tenantId: string,
  permissionKey: string,
): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data: rolePerms } = await supabase
    .from('role_permissions')
    .select('role_id')
    .eq('permission_key', permissionKey);

  const roleIds = [...new Set((rolePerms ?? []).map((r) => r.role_id))];
  if (roleIds.length === 0) return [];

  const { data: assignments } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .in('role_id', roleIds);

  const userIds = [...new Set((assignments ?? []).map((a) => a.user_id))];
  if (userIds.length === 0) return [];

  const { data: active } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .in('user_id', userIds);

  return [...new Set((active ?? []).map((m) => m.user_id))];
}
