'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { maintenancePlanInputSchema } from '@/lib/schemas/maintenance';

export type MaintenancePlanFormState = {
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
  return maintenancePlanInputSchema.safeParse(raw);
}

function friendlyDbMessage(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für diese Aktion.';
  if (msg.includes('violates foreign key')) return 'Verweis auf Objekt oder Einheit ist ungültig.';
  if (msg.includes('passt nicht zur property_id'))
    return 'Einheit gehört nicht zum gewählten Objekt.';
  if (msg.includes('interval_days')) return 'Intervall muss zwischen 1 und 3650 Tagen liegen.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(base: string, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function createMaintenancePlanAction(
  _prev: MaintenancePlanFormState,
  formData: FormData,
): Promise<MaintenancePlanFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const nextDueAt = parsed.data.next_due_at ?? todayIso();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('maintenance_plans')
    .insert({
      tenant_id: ctx.tenantId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      property_id: parsed.data.property_id,
      building_id: parsed.data.building_id,
      unit_id: parsed.data.unit_id,
      interval_days: parsed.data.interval_days,
      estimated_minutes: parsed.data.estimated_minutes,
      priority: parsed.data.priority,
      assigned_role: parsed.data.assigned_role,
      next_due_at: nextDueAt,
      active: parsed.data.active,
      notes: parsed.data.notes,
    })
    .select('id')
    .single();

  if (error || !data) return { error: friendlyDbMessage(error?.message) };

  revalidatePath('/maintenance');
  redirect(`/maintenance/${data.id}`);
}

export async function updateMaintenancePlanAction(
  planId: string,
  _prev: MaintenancePlanFormState,
  formData: FormData,
): Promise<MaintenancePlanFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('maintenance_plans')
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      property_id: parsed.data.property_id,
      building_id: parsed.data.building_id,
      unit_id: parsed.data.unit_id,
      interval_days: parsed.data.interval_days,
      estimated_minutes: parsed.data.estimated_minutes,
      priority: parsed.data.priority,
      assigned_role: parsed.data.assigned_role,
      next_due_at: parsed.data.next_due_at ?? undefined,
      active: parsed.data.active,
      notes: parsed.data.notes,
      updated_by: ctx.userId,
    })
    .eq('id', planId);

  if (error) return { error: friendlyDbMessage(error.message) };

  revalidatePath('/maintenance');
  revalidatePath(`/maintenance/${planId}`);
  redirect(`/maintenance/${planId}`);
}

export async function toggleMaintenancePlanActiveAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const planId = String(formData.get('plan_id') ?? '');
  const nextActive = String(formData.get('active') ?? 'true') === 'true';

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('maintenance_plans')
    .update({ active: nextActive, updated_by: ctx.userId })
    .eq('id', planId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/maintenance');
  revalidatePath(`/maintenance/${planId}`);
}

export async function deleteMaintenancePlanAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const planId = String(formData.get('plan_id') ?? '');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('maintenance_plans')
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', planId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/maintenance');
  redirect('/maintenance');
}

/**
 * Erzeugt aus einem Wartungsplan einen konkreten work_order und schiebt
 * last_completed_at + next_due_at nach vorn (heute + interval_days).
 * Braucht `maintenance.edit` (RLS auf plan) UND `work_orders.create` (RLS auf order).
 */
export async function generateWorkOrderFromPlanAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const planId = String(formData.get('plan_id') ?? '');
  if (!planId) throw new Error('Plan fehlt.');

  const supabase = await createSupabaseServerClient();

  const { data: plan, error: planErr } = await supabase
    .from('maintenance_plans')
    .select(
      'id, tenant_id, title, description, category, property_id, building_id, unit_id, priority, estimated_minutes, interval_days, next_due_at, active',
    )
    .eq('id', planId)
    .is('deleted_at', null)
    .single();

  if (planErr || !plan) throw new Error('Wartungsplan nicht gefunden.');
  if (!plan.active) throw new Error('Der Wartungsplan ist deaktiviert.');

  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('work_orders.create')) {
    throw new Error('Fehlende Berechtigung: Auftrag erstellen.');
  }

  const { data: order, error: orderErr } = await supabase
    .from('work_orders')
    .insert({
      tenant_id: ctx.tenantId,
      title: plan.title,
      description: plan.description
        ? `${plan.description}\n\n(Aus Wartungsplan generiert)`
        : '(Aus Wartungsplan generiert)',
      category: plan.category ?? 'Wartung',
      priority: plan.priority,
      status: 'planned',
      property_id: plan.property_id,
      building_id: plan.building_id,
      unit_id: plan.unit_id,
      estimated_minutes: plan.estimated_minutes,
      reporter_kind: 'system',
      planned_start: `${plan.next_due_at}T08:00:00`,
      deadline: `${plan.next_due_at}T18:00:00`,
      is_emergency: false,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single();

  if (orderErr || !order) throw new Error(friendlyDbMessage(orderErr?.message));

  const now = new Date();
  const nextDue = addDaysIso(todayIso(), plan.interval_days);
  const { error: updateErr } = await supabase
    .from('maintenance_plans')
    .update({
      last_completed_at: now.toISOString(),
      next_due_at: nextDue,
      updated_by: ctx.userId,
    })
    .eq('id', planId);

  if (updateErr) throw new Error(friendlyDbMessage(updateErr.message));

  revalidatePath('/maintenance');
  revalidatePath(`/maintenance/${planId}`);
  revalidatePath('/work-orders');
  redirect(`/work-orders/${order.id}`);
}
