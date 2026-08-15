'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { checklistItemInputSchema, checklistTemplateInputSchema } from '@/lib/schemas/checklists';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';

export type TemplateFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type ItemFormState = {
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

function friendlyDbMessage(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für diese Aktion.';
  if (msg.includes('duplicate key value')) return 'Diese Position ist bereits vergeben.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

// -----------------------------------------------------------------------------
// Templates
// -----------------------------------------------------------------------------

function parseTemplateForm(formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) if (typeof v === 'string') raw[k] = v;
  return checklistTemplateInputSchema.safeParse(raw);
}

export async function createTemplateAction(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseTemplateForm(formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('checklist_templates')
    .insert({
      tenant_id: ctx.tenantId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      ...parsed.data,
    })
    .select('id')
    .single();

  if (error || !data) return { error: friendlyDbMessage(error?.message) };

  revalidatePath('/checklists');
  redirect(`/checklists/${data.id}`);
}

export async function updateTemplateAction(
  templateId: string,
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseTemplateForm(formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('checklist_templates')
    .update({ ...parsed.data, updated_by: ctx.userId })
    .eq('id', templateId);

  if (error) return { error: friendlyDbMessage(error.message) };

  revalidatePath('/checklists');
  revalidatePath(`/checklists/${templateId}`);
  redirect(`/checklists/${templateId}`);
}

export async function deleteTemplateAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const templateId = String(formData.get('template_id') ?? '');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('checklist_templates')
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', templateId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/checklists');
  redirect('/checklists');
}

// -----------------------------------------------------------------------------
// Items
// -----------------------------------------------------------------------------

function parseItemForm(formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) if (typeof v === 'string') raw[k] = v;
  return checklistItemInputSchema.safeParse(raw);
}

export async function addItemAction(
  templateId: string,
  _prev: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseItemForm(formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();

  const existingRes = await supabase
    .from('checklist_template_items')
    .select('position')
    .eq('template_id', templateId)
    .order('position', { ascending: false })
    .limit(1);
  const existing = unwrapRows(existingRes, 'Checklisten: vorhandene Positionen der Vorlage');
  const nextPosition = (existing[0]?.position ?? 0) + 1;

  const { error } = await supabase.from('checklist_template_items').insert({
    tenant_id: ctx.tenantId,
    template_id: templateId,
    position: nextPosition,
    kind: parsed.data.kind,
    label: parsed.data.label,
    help_text: parsed.data.help_text,
    required: parsed.data.required,
    unit: parsed.data.unit,
    min_value: parsed.data.min_value,
    max_value: parsed.data.max_value,
  });

  if (error) return { error: friendlyDbMessage(error.message) };

  revalidatePath(`/checklists/${templateId}`);
  return {};
}

export async function updateItemAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const itemId = String(formData.get('item_id') ?? '');
  const templateId = String(formData.get('template_id') ?? '');
  const parsed = parseItemForm(formData);
  if (!parsed.success) {
    throw new Error('Ungültige Eingaben.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('checklist_template_items')
    .update({
      kind: parsed.data.kind,
      label: parsed.data.label,
      help_text: parsed.data.help_text,
      required: parsed.data.required,
      unit: parsed.data.unit,
      min_value: parsed.data.min_value,
      max_value: parsed.data.max_value,
    })
    .eq('id', itemId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath(`/checklists/${templateId}`);
}

export async function deleteItemAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const itemId = String(formData.get('item_id') ?? '');
  const templateId = String(formData.get('template_id') ?? '');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('checklist_template_items').delete().eq('id', itemId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath(`/checklists/${templateId}`);
}

/**
 * Verschiebt ein Item um eine Position nach oben oder unten. Nutzt einen
 * negativen Zwischenwert, um die UNIQUE-Constraint (template_id, position)
 * nicht zu verletzen.
 */
export async function moveItemAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const itemId = String(formData.get('item_id') ?? '');
  const templateId = String(formData.get('template_id') ?? '');
  const direction = String(formData.get('direction') ?? '');
  if (direction !== 'up' && direction !== 'down') {
    throw new Error('Ungültige Richtung.');
  }

  const supabase = await createSupabaseServerClient();

  const itemRes = await supabase
    .from('checklist_template_items')
    .select('id, position')
    .eq('id', itemId)
    .single();
  const item = unwrapMaybeRow(itemRes, 'Checklisten: zu verschiebender Eintrag');

  if (!item) throw new Error('Item nicht gefunden.');

  const targetPos = direction === 'up' ? item.position - 1 : item.position + 1;

  const swapRes = await supabase
    .from('checklist_template_items')
    .select('id, position')
    .eq('template_id', templateId)
    .eq('position', targetPos)
    .maybeSingle();
  const swap = unwrapMaybeRow(swapRes, 'Checklisten: Tauschpartner an der Zielposition');

  if (!swap) return;

  const parkPosition = -Math.abs(item.position);
  const step1 = await supabase
    .from('checklist_template_items')
    .update({ position: parkPosition })
    .eq('id', item.id);
  if (step1.error) throw new Error(friendlyDbMessage(step1.error.message));

  const step2 = await supabase
    .from('checklist_template_items')
    .update({ position: item.position })
    .eq('id', swap.id);
  if (step2.error) throw new Error(friendlyDbMessage(step2.error.message));

  const step3 = await supabase
    .from('checklist_template_items')
    .update({ position: targetPos })
    .eq('id', item.id);
  if (step3.error) throw new Error(friendlyDbMessage(step3.error.message));

  revalidatePath(`/checklists/${templateId}`);
}
