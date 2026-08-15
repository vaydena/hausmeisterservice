'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import {
  eventInputSchema,
  vehicleInputSchema,
  vehicleStatusUpdateSchema,
  type EventKind,
} from '@/lib/schemas/vehicles';

export type VehicleFormState = {
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
  if (msg.includes('vehicles_tenant_id_license_plate_key'))
    return 'Kennzeichen ist bereits vergeben.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

/**
 * Welches Frist-Feld auf vehicles wird durch welchen Event-Kind aktualisiert,
 * wenn im Event-Formular `next_due_at` mitgegeben wurde.
 */
const NEXT_DUE_FIELD: Partial<Record<EventKind, 'next_tuev_at' | 'next_service_at' | 'insurance_expires_at'>> = {
  tuev: 'next_tuev_at',
  service: 'next_service_at',
  insurance_renewal: 'insurance_expires_at',
};

export async function createVehicleAction(
  _prev: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(vehicleInputSchema, formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      tenant_id: ctx.tenantId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      ...parsed.data,
    })
    .select('id')
    .single();

  if (error || !data) return { error: friendlyDbMessage(error?.message) };

  revalidatePath('/vehicles');
  redirect(`/vehicles/${data.id}`);
}

export async function updateVehicleAction(
  vehicleId: string,
  _prev: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(vehicleInputSchema, formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('vehicles')
    .update({ ...parsed.data, updated_by: ctx.userId })
    .eq('id', vehicleId);

  if (error) return { error: friendlyDbMessage(error.message) };

  revalidatePath('/vehicles');
  revalidatePath(`/vehicles/${vehicleId}`);
  redirect(`/vehicles/${vehicleId}`);
}

export async function setVehicleStatusAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = vehicleStatusUpdateSchema.safeParse({
    vehicle_id: formData.get('vehicle_id') ?? '',
    status: formData.get('status') ?? '',
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('vehicles')
    .update({ status: parsed.data.status, updated_by: ctx.userId })
    .eq('id', parsed.data.vehicle_id);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/vehicles');
  revalidatePath(`/vehicles/${parsed.data.vehicle_id}`);
}

export async function softDeleteVehicleAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const vehicleId = String(formData.get('vehicle_id') ?? '');
  if (!vehicleId) throw new Error('Fahrzeug fehlt.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('vehicles')
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', vehicleId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/vehicles');
  redirect('/vehicles');
}

/**
 * Event buchen. Zusätzlich:
 *   - wenn `mileage_km` gesetzt → Fahrzeug-Kilometerstand nachziehen (nur wenn größer)
 *   - wenn `next_due_at` gesetzt und kind ∈ NEXT_DUE_FIELD → passende Frist aktualisieren
 */
export async function recordVehicleEventAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = eventInputSchema.safeParse({
    vehicle_id: formData.get('vehicle_id') ?? '',
    kind: formData.get('kind') ?? '',
    event_date: formData.get('event_date') ?? '',
    mileage_km: formData.get('mileage_km') ?? undefined,
    cost_eur: formData.get('cost_eur') ?? undefined,
    vendor: formData.get('vendor') ?? undefined,
    next_due_at: formData.get('next_due_at') ?? undefined,
    note: formData.get('note') ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from('vehicle_events').insert({
    tenant_id: ctx.tenantId,
    vehicle_id: parsed.data.vehicle_id,
    kind: parsed.data.kind,
    event_date: parsed.data.event_date,
    mileage_km: parsed.data.mileage_km,
    cost_eur: parsed.data.cost_eur,
    vendor: parsed.data.vendor,
    next_due_at: parsed.data.next_due_at,
    note: parsed.data.note,
    created_by: ctx.userId,
  });
  if (error) throw new Error(friendlyDbMessage(error.message));

  // Kaskade: Fahrzeug-Fristen und Km-Stand aktualisieren
  const updates: {
    next_tuev_at?: string;
    next_service_at?: string;
    insurance_expires_at?: string;
    mileage_km?: number;
    updated_by?: string;
  } = {};

  if (parsed.data.next_due_at) {
    const targetField = NEXT_DUE_FIELD[parsed.data.kind];
    if (targetField) updates[targetField] = parsed.data.next_due_at;
  }

  if (parsed.data.mileage_km !== null) {
    // Sprint 109: Der Vergleich unten ist eine Schutzregel — der Km-Stand
    // soll nur nach oben laufen. Ein verschluckter Query-Fehler drehte sie
    // um: current wurde null, currentKm damit 0, und JEDER eingetragene
    // Wert galt als groesser. Der Km-Stand wurde also gerade dann
    // ueberschrieben, wenn der alte nicht gelesen werden konnte.
    const current = unwrapMaybeRow(
      await supabase
        .from('vehicles')
        .select('mileage_km')
        .eq('id', parsed.data.vehicle_id)
        .maybeSingle(),
      'Fahrzeug-Ereignis: bisheriger Km-Stand',
    );
    const currentKm = current?.mileage_km ?? 0;
    if (parsed.data.mileage_km > currentKm) {
      updates.mileage_km = parsed.data.mileage_km;
    }
  }

  if (Object.keys(updates).length > 0) {
    updates.updated_by = ctx.userId;
    const { error: updErr } = await supabase
      .from('vehicles')
      .update(updates)
      .eq('id', parsed.data.vehicle_id);
    if (updErr) throw new Error(friendlyDbMessage(updErr.message));
  }

  revalidatePath(`/vehicles/${parsed.data.vehicle_id}`);
  revalidatePath('/vehicles');
}
