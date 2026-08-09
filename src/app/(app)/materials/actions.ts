'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  materialInputSchema,
  materialStatusUpdateSchema,
  movementInputSchema,
  type MovementKind,
} from '@/lib/schemas/materials';

export type MaterialFormState = {
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
  if (msg.includes('stock_movements_signed_by_kind'))
    return 'Menge/Richtung passen nicht zur Bewegungsart.';
  if (msg.includes('materials_min_stock_check'))
    return 'Meldebestand darf nicht negativ sein.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

function signedQuantity(kind: MovementKind, absQty: number, direction?: 'increase' | 'decrease'): number {
  switch (kind) {
    case 'receipt':
      return absQty;
    case 'issue':
    case 'write_off':
      return -absQty;
    case 'adjustment':
      return direction === 'decrease' ? -absQty : absQty;
  }
}

export async function createMaterialAction(
  _prev: MaterialFormState,
  formData: FormData,
): Promise<MaterialFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(materialInputSchema, formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('materials')
    .insert({
      tenant_id: ctx.tenantId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      ...parsed.data,
    })
    .select('id')
    .single();

  if (error || !data) return { error: friendlyDbMessage(error?.message) };

  revalidatePath('/materials');
  redirect(`/materials/${data.id}`);
}

export async function updateMaterialAction(
  materialId: string,
  _prev: MaterialFormState,
  formData: FormData,
): Promise<MaterialFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(materialInputSchema, formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('materials')
    .update({ ...parsed.data, updated_by: ctx.userId })
    .eq('id', materialId);

  if (error) return { error: friendlyDbMessage(error.message) };

  revalidatePath('/materials');
  revalidatePath(`/materials/${materialId}`);
  redirect(`/materials/${materialId}`);
}

export async function setMaterialStatusAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = materialStatusUpdateSchema.safeParse({
    material_id: formData.get('material_id') ?? '',
    status: formData.get('status') ?? '',
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('materials')
    .update({ status: parsed.data.status, updated_by: ctx.userId })
    .eq('id', parsed.data.material_id);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/materials');
  revalidatePath(`/materials/${parsed.data.material_id}`);
}

export async function softDeleteMaterialAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const materialId = String(formData.get('material_id') ?? '');
  if (!materialId) throw new Error('Material fehlt.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('materials')
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', materialId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/materials');
  redirect('/materials');
}

/**
 * Bewegung buchen — Vorzeichen aus kind (und direction bei adjustment) abgeleitet.
 * Bei kind='issue' und quantity>current_stock: Warnung, aber weiterhin erlaubt
 * (physikalisch kann jemand mehr entnehmen als der Bestand denkt — Nachbuchung).
 */
export async function recordMovementAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = movementInputSchema.safeParse({
    material_id: formData.get('material_id') ?? '',
    kind: formData.get('kind') ?? '',
    quantity: formData.get('quantity') ?? '',
    direction: formData.get('direction') ?? undefined,
    unit_cost_at_time: formData.get('unit_cost_at_time') ?? undefined,
    property_id: formData.get('property_id') ?? undefined,
    building_id: formData.get('building_id') ?? undefined,
    unit_id: formData.get('unit_id') ?? undefined,
    work_order_id: formData.get('work_order_id') ?? undefined,
    assignee_user_id: formData.get('assignee_user_id') ?? undefined,
    occurred_at: formData.get('occurred_at') ?? '',
    note: formData.get('note') ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const signed = signedQuantity(parsed.data.kind, parsed.data.quantity, parsed.data.direction);
  const occurredIso = new Date(parsed.data.occurred_at).toISOString();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('stock_movements').insert({
    tenant_id: ctx.tenantId,
    material_id: parsed.data.material_id,
    kind: parsed.data.kind,
    quantity: signed,
    unit_cost_at_time: parsed.data.unit_cost_at_time,
    property_id: parsed.data.property_id,
    building_id: parsed.data.building_id,
    unit_id: parsed.data.unit_id,
    work_order_id: parsed.data.work_order_id,
    assignee_user_id: parsed.data.assignee_user_id,
    occurred_at: occurredIso,
    note: parsed.data.note,
    created_by: ctx.userId,
  });

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath(`/materials/${parsed.data.material_id}`);
  revalidatePath('/materials');
}
