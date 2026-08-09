'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isRunItemAnswered } from '@/lib/schemas/checklists';

function friendlyDbMessage(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für diese Aktion.';
  if (msg.includes('violates foreign key')) return 'Verweis auf Vorlage oder Auftrag ist ungültig.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

/**
 * Startet einen Run für ein Template. Optional an einen Work Order gebunden;
 * dann wird property_id vom WO übernommen. RLS erzwingt die passenden Rechte
 * (work_orders.edit auf der Property, sonst checklists.edit).
 */
export async function startRunAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const templateId = String(formData.get('template_id') ?? '');
  const workOrderId = String(formData.get('work_order_id') ?? '') || null;
  if (!templateId) throw new Error('Vorlage fehlt.');

  const supabase = await createSupabaseServerClient();

  const { data: template, error: templateErr } = await supabase
    .from('checklist_templates')
    .select('id, tenant_id, active')
    .eq('id', templateId)
    .is('deleted_at', null)
    .single();
  if (templateErr || !template) throw new Error('Vorlage nicht gefunden.');
  if (!template.active) throw new Error('Vorlage ist deaktiviert.');

  let propertyId: string | null = null;
  if (workOrderId) {
    const { data: wo } = await supabase
      .from('work_orders')
      .select('property_id')
      .eq('id', workOrderId)
      .maybeSingle();
    propertyId = wo?.property_id ?? null;
  }

  const { data: items } = await supabase
    .from('checklist_template_items')
    .select('id, position, kind, label, help_text, required, unit, min_value, max_value')
    .eq('template_id', templateId)
    .order('position');

  const { data: run, error: runErr } = await supabase
    .from('checklist_runs')
    .insert({
      tenant_id: ctx.tenantId,
      template_id: templateId,
      work_order_id: workOrderId,
      property_id: propertyId,
      started_by: ctx.userId,
      status: 'in_progress',
    })
    .select('id')
    .single();

  if (runErr || !run) throw new Error(friendlyDbMessage(runErr?.message));

  if (items && items.length > 0) {
    const rows = items.map((it) => ({
      tenant_id: ctx.tenantId,
      run_id: run.id,
      template_item_id: it.id,
      position: it.position,
      kind: it.kind,
      label: it.label,
      help_text: it.help_text,
      required: it.required,
      unit: it.unit,
      min_value: it.min_value,
      max_value: it.max_value,
    }));
    const { error: itemsErr } = await supabase.from('checklist_run_items').insert(rows);
    if (itemsErr) throw new Error(friendlyDbMessage(itemsErr.message));
  }

  if (workOrderId) revalidatePath(`/work-orders/${workOrderId}`);
  redirect(`/checklist-runs/${run.id}`);
}

/**
 * Speichert einen einzelnen Item-Wert. Kind bestimmt, welches value_*-Feld
 * geschrieben wird. Vom Formular kommen nur die relevanten Felder.
 */
export async function updateRunItemAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const itemId = String(formData.get('item_id') ?? '');
  const runId = String(formData.get('run_id') ?? '');
  const kind = String(formData.get('kind') ?? '');
  const note = String(formData.get('note') ?? '').trim();

  if (!itemId || !runId) throw new Error('Item oder Run fehlt.');

  const patch: {
    value_bool?: boolean | null;
    value_text?: string | null;
    value_number?: number | null;
    note?: string | null;
    checked_at?: string | null;
    checked_by?: string | null;
  } = {
    note: note.length > 0 ? note.slice(0, 2000) : null,
    checked_at: new Date().toISOString(),
    checked_by: ctx.userId,
  };

  if (kind === 'check') {
    const raw = String(formData.get('value_bool') ?? '');
    patch.value_bool = raw === 'true' ? true : raw === 'false' ? false : null;
  } else if (kind === 'text' || kind === 'photo') {
    const raw = String(formData.get('value_text') ?? '').trim();
    patch.value_text = raw.length > 0 ? raw.slice(0, 2000) : null;
  } else if (kind === 'number') {
    const raw = String(formData.get('value_number') ?? '').trim();
    if (raw.length === 0) {
      patch.value_number = null;
    } else {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new Error('Ungültige Zahl.');
      patch.value_number = n;
    }
  } else {
    throw new Error('Unbekannter Item-Typ.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('checklist_run_items')
    .update(patch)
    .eq('id', itemId);
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath(`/checklist-runs/${runId}`);
}

/**
 * Schließt einen Run ab. Validiert vorher, dass alle required-Items beantwortet
 * sind — wenn nicht, wirft die Action einen Fehler und der User bleibt auf der
 * Run-Seite.
 */
export async function completeRunAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const runId = String(formData.get('run_id') ?? '');
  const notes = String(formData.get('notes') ?? '').trim();
  if (!runId) throw new Error('Run fehlt.');

  const supabase = await createSupabaseServerClient();

  const { data: run } = await supabase
    .from('checklist_runs')
    .select('id, status, work_order_id')
    .eq('id', runId)
    .single();
  if (!run) throw new Error('Run nicht gefunden.');
  if (run.status !== 'in_progress') throw new Error('Run ist bereits abgeschlossen.');

  const { data: items } = await supabase
    .from('checklist_run_items')
    .select('id, kind, required, value_bool, value_text, value_number, min_value, max_value, label')
    .eq('run_id', runId);

  const photoItemIds = (items ?? [])
    .filter((it) => it.kind === 'photo')
    .map((it) => it.id);
  const docCountByItem = new Map<string, number>();
  if (photoItemIds.length > 0) {
    const { data: docs } = await supabase
      .from('documents')
      .select('entity_id')
      .eq('entity_type', 'checklist_run_item')
      .in('entity_id', photoItemIds);
    for (const doc of docs ?? []) {
      docCountByItem.set(doc.entity_id, (docCountByItem.get(doc.entity_id) ?? 0) + 1);
    }
  }

  const missing = (items ?? [])
    .filter((it) => it.required && !isRunItemAnswered(it, docCountByItem.get(it.id) ?? 0))
    .map((it) => it.label);
  if (missing.length > 0) {
    throw new Error(`Bitte Pflichtfelder ausfüllen: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ' …' : ''}`);
  }

  const { error } = await supabase
    .from('checklist_runs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: ctx.userId,
      notes: notes.length > 0 ? notes.slice(0, 2000) : null,
    })
    .eq('id', runId);
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath(`/checklist-runs/${runId}`);
  if (run.work_order_id) revalidatePath(`/work-orders/${run.work_order_id}`);
}

export async function cancelRunAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const runId = String(formData.get('run_id') ?? '');
  if (!runId) throw new Error('Run fehlt.');

  const supabase = await createSupabaseServerClient();

  const { data: run } = await supabase
    .from('checklist_runs')
    .select('id, status, work_order_id')
    .eq('id', runId)
    .single();
  if (!run) throw new Error('Run nicht gefunden.');
  if (run.status !== 'in_progress') throw new Error('Run ist bereits abgeschlossen.');

  const { error } = await supabase
    .from('checklist_runs')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      completed_by: ctx.userId,
    })
    .eq('id', runId);
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath(`/checklist-runs/${runId}`);
  if (run.work_order_id) revalidatePath(`/work-orders/${run.work_order_id}`);
}
