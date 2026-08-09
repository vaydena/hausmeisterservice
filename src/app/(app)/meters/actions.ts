'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  meterInputSchema,
  meterStatusUpdateSchema,
  readingInputSchema,
} from '@/lib/schemas/meters';

export type MeterFormState = {
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
  if (msg.includes('violates foreign key')) return 'Verweis ist ungültig.';
  if (msg.includes('meter_readings_meter_id_read_at_key'))
    return 'Für diesen Zeitpunkt gibt es bereits eine Ablesung.';
  if (msg.includes('meter_readings_reading_check'))
    return 'Zählerstand darf nicht negativ sein.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

export async function createMeterAction(
  _prev: MeterFormState,
  formData: FormData,
): Promise<MeterFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(meterInputSchema, formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('meters')
    .insert({
      tenant_id: ctx.tenantId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      ...parsed.data,
    })
    .select('id')
    .single();

  if (error || !data) return { error: friendlyDbMessage(error?.message) };

  revalidatePath('/meters');
  redirect(`/meters/${data.id}`);
}

export async function updateMeterAction(
  meterId: string,
  _prev: MeterFormState,
  formData: FormData,
): Promise<MeterFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(meterInputSchema, formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('meters')
    .update({ ...parsed.data, updated_by: ctx.userId })
    .eq('id', meterId);

  if (error) return { error: friendlyDbMessage(error.message) };

  revalidatePath('/meters');
  revalidatePath(`/meters/${meterId}`);
  redirect(`/meters/${meterId}`);
}

export async function setMeterStatusAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = meterStatusUpdateSchema.safeParse({
    meter_id: formData.get('meter_id') ?? '',
    status: formData.get('status') ?? '',
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('meters')
    .update({ status: parsed.data.status, updated_by: ctx.userId })
    .eq('id', parsed.data.meter_id);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/meters');
  revalidatePath(`/meters/${parsed.data.meter_id}`);
}

export async function softDeleteMeterAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const meterId = String(formData.get('meter_id') ?? '');
  if (!meterId) throw new Error('Zähler fehlt.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('meters')
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', meterId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/meters');
  redirect('/meters');
}

/**
 * Neue Ablesung — read_at kommt als lokales datetime-local aus dem Form, wird
 * zu ISO konvertiert. Sanity: reading muss >= letzte Ablesung, außer is_reset.
 */
export async function addReadingAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = readingInputSchema.safeParse({
    meter_id: formData.get('meter_id') ?? '',
    read_at: formData.get('read_at') ?? '',
    reading: formData.get('reading') ?? '',
    source: formData.get('source') ?? 'manual',
    is_reset: formData.get('is_reset') ?? undefined,
    reference_work_order_id: formData.get('reference_work_order_id') ?? undefined,
    note: formData.get('note') ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();
  const { data: meter, error: meterErr } = await supabase
    .from('meters')
    .select('property_id, label')
    .eq('id', parsed.data.meter_id)
    .maybeSingle();
  if (meterErr || !meter) throw new Error('Zähler nicht gefunden.');

  const readIso = new Date(parsed.data.read_at).toISOString();

  if (!parsed.data.is_reset) {
    const { data: last } = await supabase
      .from('meter_readings')
      .select('reading, read_at')
      .eq('meter_id', parsed.data.meter_id)
      .lte('read_at', readIso)
      .order('read_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last && Number(last.reading) > parsed.data.reading) {
      throw new Error(
        `Neuer Stand (${parsed.data.reading}) liegt unter dem letzten (${last.reading}). Bei Zählertausch bitte „Reset" markieren.`,
      );
    }
  }

  const { error } = await supabase.from('meter_readings').insert({
    tenant_id: ctx.tenantId,
    meter_id: parsed.data.meter_id,
    property_id: meter.property_id,
    read_at: readIso,
    reading: parsed.data.reading,
    source: parsed.data.source,
    is_reset: parsed.data.is_reset,
    reference_work_order_id: parsed.data.reference_work_order_id,
    note: parsed.data.note,
    created_by: ctx.userId,
  });

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath(`/meters/${parsed.data.meter_id}`);
  revalidatePath('/meters');
}
