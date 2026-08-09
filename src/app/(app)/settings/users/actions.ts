'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { roleInputSchema, slugifyRoleKey } from '@/lib/schemas/roles';
import { PERMISSIONS_BY_KEY, type PermissionKey } from '@/lib/permissions/registry';

export type RoleFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function parseRoleForm(formData: FormData) {
  const raw = {
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? ''),
  };
  return roleInputSchema.safeParse(raw);
}

function fieldErrorsFromZod(err: import('zod').ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

function collectPermissions(formData: FormData): PermissionKey[] {
  const raw = formData.getAll('permissions').map(String);
  const valid = raw.filter((k) => Boolean(PERMISSIONS_BY_KEY[k]));
  return [...new Set(valid)];
}

async function requireManagePermission() {
  const ctx = await requireTenantContext();
  const perms = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!perms.has('core.users_roles.manage')) {
    throw new Error('Fehlende Berechtigung, um Rollen zu verwalten.');
  }
  return ctx;
}

async function requireEditPermission() {
  const ctx = await requireTenantContext();
  const perms = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!perms.has('core.users_roles.edit')) {
    throw new Error('Fehlende Berechtigung, um Rollen zuzuweisen.');
  }
  return ctx;
}

export async function createRoleAction(
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const ctx = await requireManagePermission();
  const parsed = parseRoleForm(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), error: 'Bitte prüfen Sie die Eingaben.' };
  }
  const perms = collectPermissions(formData);
  const baseKey = slugifyRoleKey(parsed.data.name) || 'rolle';
  const key = await uniqueRoleKey(ctx.tenantId, baseKey);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('roles')
    .insert({
      tenant_id: ctx.tenantId,
      key,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      is_system: false,
    })
    .select('id')
    .single();

  if (error || !data) return { error: friendlyDbMessage(error?.message) };

  if (perms.length > 0) {
    const rows = perms.map((permission_key) => ({ role_id: data.id, permission_key }));
    const { error: permErr } = await supabase.from('role_permissions').insert(rows);
    if (permErr) return { error: friendlyDbMessage(permErr.message) };
  }

  revalidatePath('/settings/users');
  redirect('/settings/users');
}

export async function updateRoleAction(
  roleId: string,
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const ctx = await requireManagePermission();
  const parsed = parseRoleForm(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), error: 'Bitte prüfen Sie die Eingaben.' };
  }
  const perms = collectPermissions(formData);
  const supabase = await createSupabaseServerClient();

  const { data: role } = await supabase
    .from('roles')
    .select('id, is_system, key')
    .eq('id', roleId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!role) return { error: 'Rolle nicht gefunden.' };
  if (role.is_system && role.key === 'superadmin') {
    return { error: 'Der Superadministrator lässt sich nicht bearbeiten.' };
  }

  const { error } = await supabase
    .from('roles')
    .update({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    })
    .eq('id', roleId);
  if (error) return { error: friendlyDbMessage(error.message) };

  // Rechte-Set komplett neu setzen: alte löschen, neue schreiben.
  const del = await supabase.from('role_permissions').delete().eq('role_id', roleId);
  if (del.error) return { error: friendlyDbMessage(del.error.message) };

  if (perms.length > 0) {
    const rows = perms.map((permission_key) => ({ role_id: roleId, permission_key }));
    const { error: permErr } = await supabase.from('role_permissions').insert(rows);
    if (permErr) return { error: friendlyDbMessage(permErr.message) };
  }

  revalidatePath('/settings/users');
  redirect('/settings/users');
}

export async function deleteRoleAction(formData: FormData): Promise<void> {
  const ctx = await requireManagePermission();
  const roleId = String(formData.get('role_id') ?? '');
  if (!roleId) throw new Error('Rolle fehlt.');

  const supabase = await createSupabaseServerClient();
  const { data: role } = await supabase
    .from('roles')
    .select('id, is_system')
    .eq('id', roleId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!role) throw new Error('Rolle nicht gefunden.');
  if (role.is_system) throw new Error('System-Rollen lassen sich nicht löschen.');

  const { error } = await supabase.from('roles').delete().eq('id', roleId);
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/settings/users');
}

export async function assignRoleAction(formData: FormData): Promise<void> {
  const ctx = await requireEditPermission();
  const userId = String(formData.get('user_id') ?? '');
  const roleId = String(formData.get('role_id') ?? '');
  if (!userId || !roleId) throw new Error('Benutzer oder Rolle fehlen.');

  const supabase = await createSupabaseServerClient();
  const { data: role } = await supabase
    .from('roles')
    .select('id')
    .eq('id', roleId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!role) throw new Error('Rolle gehört nicht zu diesem Mandanten.');

  const existing = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', ctx.tenantId)
    .eq('role_id', roleId)
    .is('scope_type', null)
    .maybeSingle();
  if (existing.data) {
    revalidatePath('/settings/users');
    return;
  }

  const { error } = await supabase.from('user_roles').insert({
    user_id: userId,
    tenant_id: ctx.tenantId,
    role_id: roleId,
    scope_type: null,
    scope_id: null,
    created_by: ctx.userId,
  });
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/settings/users');
}

export async function removeRoleAssignmentAction(formData: FormData): Promise<void> {
  const ctx = await requireEditPermission();
  const userRoleId = String(formData.get('user_role_id') ?? '');
  if (!userRoleId) throw new Error('Zuweisung fehlt.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('user_roles')
    .delete()
    .eq('id', userRoleId)
    .eq('tenant_id', ctx.tenantId);
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/settings/users');
}

async function uniqueRoleKey(tenantId: string, baseKey: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  let candidate = baseKey;
  let suffix = 2;

  while (true) {
    const { data } = await supabase
      .from('roles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('key', candidate)
      .maybeSingle();
    if (!data) return candidate;
    candidate = `${baseKey}-${suffix++}`;
    if (suffix > 100) throw new Error('Zu viele Rollen mit ähnlichem Namen.');
  }
}

function friendlyDbMessage(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('duplicate key value') && msg.includes('key')) {
    return 'Diese Rollen-Kennung ist bereits vergeben.';
  }
  if (msg.includes('row-level security')) {
    return 'Sie haben keine Berechtigung für diese Aktion.';
  }
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}
