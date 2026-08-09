'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { clientEnv } from '@/lib/env';
import { inviteEmployeeSchema, updateEmployeeSchema } from '@/lib/schemas/employees';

export type EmployeeFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  info?: string;
};

function fieldErrorsFromZod(err: import('zod').ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

function parseInvite(formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) if (typeof v === 'string') raw[k] = v;
  return inviteEmployeeSchema.safeParse(raw);
}

function parseUpdate(formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) if (typeof v === 'string') raw[k] = v;
  return updateEmployeeSchema.safeParse(raw);
}

export async function inviteEmployeeAction(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const ctx = await requireTenantContext();
  const perms = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!perms.has('employees.create') || !perms.has('core.users_roles.create')) {
    return { error: 'Keine Berechtigung, Mitarbeiter einzuladen.' };
  }

  const parsed = parseInvite(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), error: 'Bitte prüfen Sie die Eingaben.' };
  }
  const { email, display_name, role_key } = parsed.data;

  const service = createSupabaseServiceClient();

  // Rolle im aktuellen Tenant nachschlagen (existiert dank Onboarding-Seed)
  const { data: role } = await service
    .from('roles')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('key', role_key)
    .maybeSingle();

  if (!role) {
    return { error: 'Die gewählte Rolle existiert im aktuellen Mandanten nicht.' };
  }

  // User existiert bereits?
  const list = await service.auth.admin.listUsers({ perPage: 200 });
  if (list.error) return { error: 'Interner Fehler beim Nachschlagen der Benutzer.' };
  const existing = list.data.users.find((u) => u.email?.toLowerCase() === email);

  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    const redirectTo = `${clientEnv.NEXT_PUBLIC_APP_URL ?? ''}/reset-password?first_login=1`;
    const invited = await service.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { display_name },
    });
    if (invited.error || !invited.data.user) {
      return { error: friendlyInviteError(invited.error?.message) };
    }
    userId = invited.data.user.id;
  }

  // Profil-Row via Service (setzt display_name, falls Trigger noch nicht gelaufen)
  await service.from('users').upsert({ id: userId, display_name }, { onConflict: 'id' });

  // Membership
  const { data: existingMembership } = await service
    .from('memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!existingMembership) {
    const insMembership = await service
      .from('memberships')
      .insert({ user_id: userId, tenant_id: ctx.tenantId, status: 'active', is_owner: false });
    if (insMembership.error) return { error: 'Mitgliedschaft konnte nicht angelegt werden.' };
  }

  // Employee-Row
  const { data: existingEmployee } = await service
    .from('employees')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!existingEmployee) {
    const insEmp = await service.from('employees').insert({
      tenant_id: ctx.tenantId,
      user_id: userId,
      employment_status: 'active',
      created_by: ctx.userId,
      updated_by: ctx.userId,
    });
    if (insEmp.error) return { error: 'Mitarbeiter-Profil konnte nicht angelegt werden.' };
  }

  // Rolle zuweisen (idempotent)
  const { data: existingRole } = await service
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', ctx.tenantId)
    .eq('role_id', role.id)
    .is('scope_type', null)
    .maybeSingle();

  if (!existingRole) {
    const insRole = await service.from('user_roles').insert({
      user_id: userId,
      tenant_id: ctx.tenantId,
      role_id: role.id,
      scope_type: null,
      scope_id: null,
      created_by: ctx.userId,
    });
    if (insRole.error) return { error: 'Rolle konnte nicht zugewiesen werden.' };
  }

  revalidatePath('/people/employees');
  redirect('/people/employees');
}

export async function updateEmployeeAction(
  employeeId: string,
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseUpdate(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), error: 'Bitte prüfen Sie die Eingaben.' };
  }
  const { skills_csv, ...rest } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('employees')
    .update({
      ...rest,
      skills: skills_csv,
      updated_by: ctx.userId,
    })
    .eq('id', employeeId);
  if (error) return { error: 'Speichern fehlgeschlagen.' };

  revalidatePath('/people/employees');
  revalidatePath(`/people/employees/${employeeId}`);
  redirect(`/people/employees/${employeeId}`);
}

function friendlyInviteError(msg?: string | null): string {
  if (!msg) return 'Einladung konnte nicht versendet werden.';
  if (msg.includes('already registered') || msg.includes('already been')) {
    return 'Diese E-Mail-Adresse ist bereits registriert.';
  }
  if (msg.toLowerCase().includes('rate')) {
    return 'Zu viele Einladungen in kurzer Zeit. Bitte in ein paar Minuten erneut versuchen.';
  }
  return 'Einladung konnte nicht versendet werden.';
}
