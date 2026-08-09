'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { propertyInputSchema } from '@/lib/schemas/properties';

export type PropertyFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function parseFormData(formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') raw[key] = value;
  }
  return propertyInputSchema.safeParse(raw);
}

function fieldErrorsFromZod(err: import('zod').ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

export async function createPropertyAction(
  _prev: PropertyFormState,
  formData: FormData,
): Promise<PropertyFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), error: 'Bitte prüfen Sie die Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('properties')
    .insert({
      tenant_id: ctx.tenantId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      ...parsed.data,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { error: friendlyDbMessage(error?.message) };
  }

  revalidatePath('/properties');
  redirect(`/properties/${data.id}`);
}

export async function updatePropertyAction(
  propertyId: string,
  _prev: PropertyFormState,
  formData: FormData,
): Promise<PropertyFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), error: 'Bitte prüfen Sie die Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('properties')
    .update({ ...parsed.data, updated_by: ctx.userId })
    .eq('id', propertyId);

  if (error) return { error: friendlyDbMessage(error.message) };

  revalidatePath('/properties');
  revalidatePath(`/properties/${propertyId}`);
  redirect(`/properties/${propertyId}`);
}

export async function softDeletePropertyAction(propertyId: string) {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('properties')
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', propertyId);
  if (error) throw new Error(friendlyDbMessage(error.message));
  revalidatePath('/properties');
  redirect('/properties');
}

function friendlyDbMessage(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('duplicate key value') && msg.includes('code')) {
    return 'Diese Objekt-Nummer ist bereits vergeben.';
  }
  if (msg.includes('row-level security')) {
    return 'Sie haben keine Berechtigung für diese Aktion.';
  }
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}
