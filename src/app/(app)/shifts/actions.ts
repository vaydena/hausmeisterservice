'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { shiftInputSchema } from '@/lib/schemas/shifts';

export type ShiftFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function fieldErrorsFromZod(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

function parseForm<T extends z.ZodTypeAny>(schema: T, formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) if (typeof v === 'string') raw[k] = v;
  return schema.safeParse(raw);
}

function friendlyDbMessage(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für diese Aktion.';
  if (msg.includes('shifts_color_check')) return 'Ungültige Farbe.';
  if (msg.includes('violates check constraint')) return 'Eingabe außerhalb des zulässigen Bereichs.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

export async function createShiftAction(
  _prev: ShiftFormState,
  formData: FormData,
): Promise<ShiftFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(shiftInputSchema, formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('shifts').insert({
    tenant_id: ctx.tenantId,
    created_by: ctx.userId,
    updated_by: ctx.userId,
    ...parsed.data,
  });

  if (error) return { error: friendlyDbMessage(error.message) };

  revalidatePath('/shifts');
  redirect('/shifts');
}

export async function updateShiftAction(
  shiftId: string,
  _prev: ShiftFormState,
  formData: FormData,
): Promise<ShiftFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(shiftInputSchema, formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('shifts')
    .update({ ...parsed.data, updated_by: ctx.userId })
    .eq('id', shiftId);

  if (error) return { error: friendlyDbMessage(error.message) };

  revalidatePath('/shifts');
  redirect('/shifts');
}

export async function softDeleteShiftAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const shiftId = String(formData.get('shift_id') ?? '');
  if (!shiftId) throw new Error('Schicht fehlt.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('shifts')
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', shiftId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/shifts');
  redirect('/shifts');
}
