'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { residentInputSchema } from '@/lib/schemas/residents';

export type ResidentFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function fieldErrorsFromZod(err: import('zod').ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

function parseForm(formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) if (typeof v === 'string') raw[k] = v;
  return residentInputSchema.safeParse(raw);
}

function friendlyDbMessage(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für diese Aktion.';
  if (msg.includes('violates foreign key')) return 'Verweis auf Objekt oder Einheit ist ungültig.';
  if (msg.includes('passt nicht zur unit_id'))
    return 'Einheit gehört nicht zum gewählten Objekt.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

export async function createResidentAction(
  _prev: ResidentFormState,
  formData: FormData,
): Promise<ResidentFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), error: 'Bitte prüfen Sie die Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('residents')
    .insert({
      tenant_id: ctx.tenantId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      ...parsed.data,
    })
    .select('id')
    .single();

  if (error || !data) return { error: friendlyDbMessage(error?.message) };

  revalidatePath('/people/residents');
  redirect(`/people/residents/${data.id}`);
}

export async function updateResidentAction(
  residentId: string,
  _prev: ResidentFormState,
  formData: FormData,
): Promise<ResidentFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), error: 'Bitte prüfen Sie die Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('residents')
    .update({ ...parsed.data, updated_by: ctx.userId })
    .eq('id', residentId);

  if (error) return { error: friendlyDbMessage(error.message) };

  revalidatePath('/people/residents');
  revalidatePath(`/people/residents/${residentId}`);
  redirect(`/people/residents/${residentId}`);
}

export async function deleteResidentAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const residentId = String(formData.get('resident_id') ?? '');
  if (!residentId) throw new Error('Bewohner-ID fehlt.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('residents')
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', residentId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/people/residents');
  redirect('/people/residents');
}

export type InvitePortalState = {
  error?: string;
  success?: string;
};

/**
 * Legt (falls nötig) einen auth-User an, verlinkt user_id, setzt portal_invited_at.
 * Nutzt Service-Role — dedizierter Permission-Check vorab.
 */
export async function inviteResidentToPortalAction(
  _prev: InvitePortalState,
  formData: FormData,
): Promise<InvitePortalState> {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('residents.edit')) {
    return { error: 'Sie haben keine Berechtigung, Bewohner einzuladen.' };
  }

  const residentId = String(formData.get('resident_id') ?? '');
  if (!residentId) return { error: 'Bewohner-ID fehlt.' };

  const supabase = await createSupabaseServerClient();
  const { data: resident, error: fetchErr } = await supabase
    .from('residents')
    .select('id, tenant_id, email, first_name, last_name, user_id')
    .eq('id', residentId)
    .maybeSingle();
  if (fetchErr || !resident) return { error: 'Bewohner nicht gefunden.' };
  if (!resident.email) return { error: 'Bewohner hat keine hinterlegte E-Mail-Adresse.' };
  if (resident.user_id) return { error: 'Portal-Zugang ist bereits verknüpft.' };

  const admin = createSupabaseServiceClient();

  let userId: string | null = null;

  const invited = await admin.auth.admin.inviteUserByEmail(resident.email, {
    data: {
      resident_id: resident.id,
      first_name: resident.first_name,
      last_name: resident.last_name,
    },
  });

  if (invited.data.user) {
    userId = invited.data.user.id;
  } else {
    // Bereits existierender User → über listUsers/filter nachschlagen
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list.data.users.find(
      (u) => (u.email ?? '').toLowerCase() === resident.email!.toLowerCase(),
    );
    if (!existing) {
      return {
        error:
          invited.error?.message ??
          'Einladung fehlgeschlagen. Bitte E-Mail-Adresse prüfen und erneut versuchen.',
      };
    }
    userId = existing.id;
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await admin
    .from('residents')
    .update({
      user_id: userId,
      portal_invited_at: nowIso,
      updated_by: ctx.userId,
    })
    .eq('id', residentId);
  if (updErr) return { error: 'Verknüpfung mit Portal-Konto fehlgeschlagen.' };

  revalidatePath('/people/residents');
  revalidatePath(`/people/residents/${residentId}`);
  return { success: `Einladung an ${resident.email} wurde versendet.` };
}

export async function revokePortalAccessAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('residents.edit')) {
    throw new Error('Keine Berechtigung.');
  }

  const residentId = String(formData.get('resident_id') ?? '');
  if (!residentId) throw new Error('Bewohner-ID fehlt.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('residents')
    .update({
      user_id: null,
      portal_invited_at: null,
      portal_activated_at: null,
      updated_by: ctx.userId,
    })
    .eq('id', residentId);
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/people/residents');
  revalidatePath(`/people/residents/${residentId}`);
}
