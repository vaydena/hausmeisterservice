'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { ownerInputSchema, ownerDisplayName } from '@/lib/schemas/owners';

export type OwnerFormState = {
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
  return ownerInputSchema.safeParse(raw);
}

function friendlyDbMessage(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für diese Aktion.';
  if (msg.includes('violates check')) return 'Bei Firmen/Hausverwaltungen ist ein Firmenname Pflicht, bei Privatpersonen Vor- und Nachname.';
  if (msg.includes('duplicate key')) return 'Objekt ist diesem Eigentümer bereits zugeordnet.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

export async function createOwnerAction(
  _prev: OwnerFormState,
  formData: FormData,
): Promise<OwnerFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), error: 'Bitte prüfen Sie die Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('owners')
    .insert({
      tenant_id: ctx.tenantId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      ...parsed.data,
    })
    .select('id')
    .single();

  if (error || !data) return { error: friendlyDbMessage(error?.message) };

  revalidatePath('/people/owners');
  redirect(`/people/owners/${data.id}`);
}

export async function updateOwnerAction(
  ownerId: string,
  _prev: OwnerFormState,
  formData: FormData,
): Promise<OwnerFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), error: 'Bitte prüfen Sie die Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('owners')
    .update({ ...parsed.data, updated_by: ctx.userId })
    .eq('id', ownerId);

  if (error) return { error: friendlyDbMessage(error.message) };

  revalidatePath('/people/owners');
  revalidatePath(`/people/owners/${ownerId}`);
  redirect(`/people/owners/${ownerId}`);
}

export async function deleteOwnerAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const ownerId = String(formData.get('owner_id') ?? '');
  if (!ownerId) throw new Error('Eigentümer-ID fehlt.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('owners')
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', ownerId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/people/owners');
  redirect('/people/owners');
}

export async function attachPropertyAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const ownerId = String(formData.get('owner_id') ?? '');
  const propertyId = String(formData.get('property_id') ?? '');
  const role = (String(formData.get('role') ?? 'owner') || 'owner') as
    | 'owner'
    | 'co_owner'
    | 'management';
  const sharePercentRaw = String(formData.get('share_percent') ?? '').trim();
  const share_percent = sharePercentRaw.length > 0 ? Number(sharePercentRaw) : null;

  if (!ownerId || !propertyId) throw new Error('Eigentümer und Objekt sind erforderlich.');
  if (share_percent !== null && (Number.isNaN(share_percent) || share_percent < 0 || share_percent > 100)) {
    throw new Error('Anteil muss zwischen 0 und 100 liegen.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('owner_properties').insert({
    tenant_id: ctx.tenantId,
    owner_id: ownerId,
    property_id: propertyId,
    role,
    share_percent,
  });

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath(`/people/owners/${ownerId}`);
}

export async function detachPropertyAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const ownerId = String(formData.get('owner_id') ?? '');
  const propertyId = String(formData.get('property_id') ?? '');

  if (!ownerId || !propertyId) throw new Error('Eigentümer und Objekt sind erforderlich.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('owner_properties')
    .delete()
    .eq('owner_id', ownerId)
    .eq('property_id', propertyId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath(`/people/owners/${ownerId}`);
}

export type InvitePortalState = {
  error?: string;
  success?: string;
};

/**
 * Legt (falls nötig) einen auth-User an, verlinkt owners.user_id, setzt
 * portal_invited_at. Nutzt Service-Role — dedizierter Permission-Check vorab.
 * Spiegel von inviteResidentToPortalAction; die owners_select_own-Policy macht
 * den verknüpften Datensatz danach für den Eigentümer selbst sichtbar.
 */
export async function inviteOwnerToPortalAction(
  _prev: InvitePortalState,
  formData: FormData,
): Promise<InvitePortalState> {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('owners.edit')) {
    return { error: 'Sie haben keine Berechtigung, Eigentümer einzuladen.' };
  }

  const ownerId = String(formData.get('owner_id') ?? '');
  if (!ownerId) return { error: 'Eigentümer-ID fehlt.' };

  const supabase = await createSupabaseServerClient();
  const { data: owner, error: fetchErr } = await supabase
    .from('owners')
    .select('id, tenant_id, kind, email, first_name, last_name, company_name, user_id')
    .eq('id', ownerId)
    .maybeSingle();
  if (fetchErr || !owner) return { error: 'Eigentümer nicht gefunden.' };
  if (!owner.email) return { error: 'Eigentümer hat keine hinterlegte E-Mail-Adresse.' };
  if (owner.user_id) return { error: 'Portal-Zugang ist bereits verknüpft.' };

  const admin = createSupabaseServiceClient();

  let userId: string | null = null;

  const invited = await admin.auth.admin.inviteUserByEmail(owner.email, {
    data: {
      owner_id: owner.id,
      display_name: ownerDisplayName(owner),
    },
  });

  if (invited.data.user) {
    userId = invited.data.user.id;
  } else {
    // Bereits existierender User → über listUsers/filter nachschlagen.
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list.data.users.find(
      (u) => (u.email ?? '').toLowerCase() === owner.email!.toLowerCase(),
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
    .from('owners')
    .update({
      user_id: userId,
      portal_invited_at: nowIso,
      updated_by: ctx.userId,
    })
    .eq('id', ownerId);
  if (updErr) return { error: 'Verknüpfung mit Portal-Konto fehlgeschlagen.' };

  revalidatePath('/people/owners');
  revalidatePath(`/people/owners/${ownerId}`);
  return { success: `Einladung an ${owner.email} wurde versendet.` };
}

export async function revokeOwnerPortalAccessAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('owners.edit')) {
    throw new Error('Keine Berechtigung.');
  }

  const ownerId = String(formData.get('owner_id') ?? '');
  if (!ownerId) throw new Error('Eigentümer-ID fehlt.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('owners')
    .update({
      user_id: null,
      portal_invited_at: null,
      portal_activated_at: null,
      updated_by: ctx.userId,
    })
    .eq('id', ownerId);
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/people/owners');
  revalidatePath(`/people/owners/${ownerId}`);
}
