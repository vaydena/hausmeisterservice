'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  reorderStopsSchema,
  stopInputSchema,
  stopStatusUpdateSchema,
  stopUpdateSchema,
  tourInputSchema,
  tourStatusUpdateSchema,
} from '@/lib/schemas/tours';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';

export type TourFormState = {
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
  if (msg.includes('tour_stops_tour_id_sequence_key')) return 'Reihenfolge-Konflikt beim Stopp.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

export async function createTourAction(
  _prev: TourFormState,
  formData: FormData,
): Promise<TourFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(tourInputSchema, formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tours')
    .insert({
      tenant_id: ctx.tenantId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      ...parsed.data,
    })
    .select('id')
    .single();

  if (error || !data) return { error: friendlyDbMessage(error?.message) };

  revalidatePath('/tours');
  redirect(`/tours/${data.id}`);
}

export async function updateTourAction(
  tourId: string,
  _prev: TourFormState,
  formData: FormData,
): Promise<TourFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(tourInputSchema, formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('tours')
    .update({ ...parsed.data, updated_by: ctx.userId })
    .eq('id', tourId);

  if (error) return { error: friendlyDbMessage(error.message) };

  revalidatePath('/tours');
  revalidatePath(`/tours/${tourId}`);
  redirect(`/tours/${tourId}`);
}

/**
 * Status-Setzer: markiert `started_at` / `completed_at` passend zum Übergang.
 */
export async function setTourStatusAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = tourStatusUpdateSchema.safeParse({
    tour_id: formData.get('tour_id') ?? '',
    status: formData.get('status') ?? '',
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');

  const supabase = await createSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const patch: {
    status: (typeof parsed.data)['status'];
    started_at?: string | null;
    completed_at?: string | null;
    updated_by: string;
  } = { status: parsed.data.status, updated_by: ctx.userId };

  if (parsed.data.status === 'in_progress') patch.started_at = nowIso;
  if (parsed.data.status === 'completed') patch.completed_at = nowIso;
  if (parsed.data.status === 'draft' || parsed.data.status === 'planned') {
    patch.started_at = null;
    patch.completed_at = null;
  }

  const { error } = await supabase.from('tours').update(patch).eq('id', parsed.data.tour_id);
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/tours');
  revalidatePath(`/tours/${parsed.data.tour_id}`);
}

export async function softDeleteTourAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const tourId = String(formData.get('tour_id') ?? '');
  if (!tourId) throw new Error('Tour fehlt.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('tours')
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', tourId);
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/tours');
  redirect('/tours');
}

/**
 * Neuen Stopp anhängen — sequence = max(existing) + 1.
 */
export async function addStopAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(stopInputSchema, formData);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();
  const lastRes = await supabase
    .from('tour_stops')
    .select('sequence')
    .eq('tour_id', parsed.data.tour_id)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle();
  const last = unwrapMaybeRow(lastRes, 'Touren: letzte Stopp-Nummer');
  const nextSeq = (last?.sequence ?? 0) + 1;

  const { error } = await supabase.from('tour_stops').insert({
    tenant_id: ctx.tenantId,
    tour_id: parsed.data.tour_id,
    sequence: nextSeq,
    property_id: parsed.data.property_id,
    label: parsed.data.label,
    planned_arrival_at: parsed.data.planned_arrival_at,
    planned_departure_at: parsed.data.planned_departure_at,
    duration_minutes: parsed.data.duration_minutes,
    note: parsed.data.note,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath(`/tours/${parsed.data.tour_id}`);
}

export async function updateStopAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(stopUpdateSchema, formData);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('tour_stops')
    .update({
      property_id: parsed.data.property_id,
      label: parsed.data.label,
      planned_arrival_at: parsed.data.planned_arrival_at,
      planned_departure_at: parsed.data.planned_departure_at,
      duration_minutes: parsed.data.duration_minutes,
      note: parsed.data.note,
      updated_by: ctx.userId,
    })
    .eq('id', parsed.data.stop_id);
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath(`/tours/${parsed.data.tour_id}`);
}

export async function removeStopAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const stopId = String(formData.get('stop_id') ?? '');
  const tourId = String(formData.get('tour_id') ?? '');
  if (!stopId || !tourId) throw new Error('Stopp/Tour fehlt.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('tour_stops').delete().eq('id', stopId);
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath(`/tours/${tourId}`);
}

/**
 * Setzt Stopp-Status und markiert Ankunft/Abfahrt.
 *   arrived   → actual_arrival_at = now
 *   completed → actual_departure_at = now (Ankunft falls fehlend auch)
 *   pending   → beides zurücksetzen
 *   skipped   → keine Zeit
 */
export async function setStopStatusAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = stopStatusUpdateSchema.safeParse({
    stop_id: formData.get('stop_id') ?? '',
    status: formData.get('status') ?? '',
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');

  const supabase = await createSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const patch: {
    status: (typeof parsed.data)['status'];
    actual_arrival_at?: string | null;
    actual_departure_at?: string | null;
    updated_by: string;
  } = { status: parsed.data.status, updated_by: ctx.userId };

  if (parsed.data.status === 'arrived') {
    patch.actual_arrival_at = nowIso;
    patch.actual_departure_at = null;
  } else if (parsed.data.status === 'completed') {
    const currentRes = await supabase
      .from('tour_stops')
      .select('actual_arrival_at, tour_id')
      .eq('id', parsed.data.stop_id)
      .maybeSingle();
    const current = unwrapMaybeRow(currentRes, 'Touren: Stopp zum Aktualisieren');
    if (!current?.actual_arrival_at) patch.actual_arrival_at = nowIso;
    patch.actual_departure_at = nowIso;
  } else if (parsed.data.status === 'pending') {
    patch.actual_arrival_at = null;
    patch.actual_departure_at = null;
  }

  const { data: updated, error } = await supabase
    .from('tour_stops')
    .update(patch)
    .eq('id', parsed.data.stop_id)
    .select('tour_id')
    .single();
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath(`/tours/${updated.tour_id}`);
}

/**
 * Bulk-Reorder: übergebene stop_ids in genau der Reihenfolge neu nummerieren.
 * Wir vergeben zunächst hohe Zwischen-Sequenzen (+ 10 000), um die UNIQUE-
 * Constraint nicht zu verletzen, danach die finalen 1..N.
 */
export async function reorderStopsAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const raw = formData.get('stop_ids');
  if (typeof raw !== 'string') throw new Error('Reihenfolge fehlt.');
  let list: string[];
  try {
    list = JSON.parse(raw);
  } catch {
    throw new Error('Ungültiges Format.');
  }
  const parsed = reorderStopsSchema.safeParse({
    tour_id: formData.get('tour_id') ?? '',
    stop_ids: list,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');

  const supabase = await createSupabaseServerClient();

  for (let i = 0; i < parsed.data.stop_ids.length; i++) {
    const stopId = parsed.data.stop_ids[i]!;
    const { error } = await supabase
      .from('tour_stops')
      .update({ sequence: 10000 + i, updated_by: ctx.userId })
      .eq('id', stopId)
      .eq('tour_id', parsed.data.tour_id);
    if (error) throw new Error(friendlyDbMessage(error.message));
  }

  for (let i = 0; i < parsed.data.stop_ids.length; i++) {
    const stopId = parsed.data.stop_ids[i]!;
    const { error } = await supabase
      .from('tour_stops')
      .update({ sequence: i + 1, updated_by: ctx.userId })
      .eq('id', stopId)
      .eq('tour_id', parsed.data.tour_id);
    if (error) throw new Error(friendlyDbMessage(error.message));
  }

  revalidatePath(`/tours/${parsed.data.tour_id}`);
}
