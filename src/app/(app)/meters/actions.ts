'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';
import {
  meterInputSchema,
  meterStatusUpdateSchema,
  readingInputSchema,
} from '@/lib/schemas/meters';
import { checkReadingPlacement, describePlacementProblem } from '@/lib/meters/consumption';

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

  // Sprint 111: "Nur moeglich, wenn noch keine Ablesungen erfasst wurden"
  // stand bisher nur im Hinweistext neben dem Knopf — die Regel wurde
  // ausschliesslich im JSX durchgesetzt (readings.length === 0). Damit hing
  // sie an derselben Query, die den Verlauf laedt: faellt die aus, erscheint
  // der Knopf, und der Zaehler mitsamt seiner Ablesehistorie verschwindet aus
  // allen Listen. Dieselbe Umkehrung wie beim Loeschknopf der Schluessel in
  // Sprint 110, hier zusaetzlich ohne serverseitige Absicherung.
  const existingReadings = unwrapRows(
    await supabase.from('meter_readings').select('id').eq('meter_id', meterId).limit(1),
    'Zähler entfernen: vorhandene Ablesungen',
  );
  if (existingReadings.length > 0) {
    throw new Error(
      'Für diesen Zähler sind bereits Ablesungen erfasst. Er kann nicht entfernt werden — bitte stattdessen auf „Inaktiv" oder „Getauscht" setzen.',
    );
  }

  const { error } = await supabase
    .from('meters')
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', meterId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/meters');
  redirect('/meters');
}

/**
 * Neue Ablesung — read_at kommt als lokales datetime-local aus dem Form und
 * wird im Schema als Berliner Zeit in einen ISO-Zeitpunkt umgerechnet.
 *
 * Sprint 111, Plausibilitaet: ein Zaehler laeuft nicht rueckwaerts. Diese
 * Regel stand vorher auf zwei wackligen Beinen.
 *
 * Erstens wurde der Vergleichswert ohne Fehlerpruefung gelesen
 * (`const { data: last } = ...`). supabase-js wirft nicht — bei einer
 * gescheiterten Query war `last` null und die Bedingung `if (last && ...)`
 * damit false. Die Pruefung ist also nicht mit einem Fehler abgebrochen,
 * sondern ausgefallen, und der Wert landete kommentarlos in der Tabelle.
 *
 * Zweitens sah sie nur nach hinten. Dass Ablesungen nachgetragen werden, war
 * eingeplant (`.lte('read_at', readIso)`) — nur eben in eine Richtung. Ein
 * nachgetragener Stand ueber der bereits erfassten NAECHSTEN Ablesung kam
 * durch und machte deren Verbrauch negativ. Beide Nachbarn werden jetzt
 * geprueft, und beide Abfragen laufen durch unwrapMaybeRow.
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
  // Getrennt von "nicht gefunden": eine gescheiterte Query hat den Zähler
  // nicht widerlegt, sie hat ihn nicht gelesen.
  const meter = unwrapMaybeRow(
    await supabase
      .from('meters')
      .select('property_id, label, unit_of_measure')
      .eq('id', parsed.data.meter_id)
      .maybeSingle(),
    'Ablesung: Zählerstammdaten',
  );
  if (!meter) throw new Error('Zähler nicht gefunden.');

  // Sprint 113: `read_at` kommt bereits als ISO-Zeitpunkt aus dem Schema —
  // dort in Berliner Zeit verankert statt hier in der Prozess-Zeitzone.
  const readIso = parsed.data.read_at;

  // Nur die beiden direkten Nachbarn, nicht die ganze Reihe: mit
  // source 'gateway' ist eine hochfrequente Ablesehistorie vorgesehen, und
  // dann waere "alles laden und im Speicher sortieren" die falsche Form. Der
  // Unique-Index auf (meter_id, read_at) traegt den Zugriff.
  const [previous, next] = await Promise.all([
    supabase
      .from('meter_readings')
      .select('reading, read_at, is_reset')
      .eq('meter_id', parsed.data.meter_id)
      .lt('read_at', readIso)
      .order('read_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r) => unwrapMaybeRow(r, 'Ablesung: vorherige Ablesung')),
    supabase
      .from('meter_readings')
      .select('reading, read_at, is_reset')
      .eq('meter_id', parsed.data.meter_id)
      .gt('read_at', readIso)
      .order('read_at', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then((r) => unwrapMaybeRow(r, 'Ablesung: nachfolgende Ablesung')),
  ]);

  // Strikt lt/gt statt lte: eine Ablesung auf denselben Zeitpunkt ist keine
  // Plausibilitaetsfrage, sondern ein Duplikat. Das meldet der Unique-Index
  // mit einer eigenen, passenderen Meldung.
  const problem = checkReadingPlacement({
    reading: parsed.data.reading,
    isReset: parsed.data.is_reset,
    previous,
    next,
  });
  if (problem) {
    throw new Error(
      describePlacementProblem(problem, parsed.data.reading, meter.unit_of_measure),
    );
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
