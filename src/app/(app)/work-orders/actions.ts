'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/notifications/create';
import { resolveEmployeeUserId } from '@/lib/notifications/recipients';
import {
  workOrderInputSchema,
  workOrderStatusSchema,
  type WorkOrderStatus,
} from '@/lib/schemas/work-orders';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';

export type WorkOrderFormState = {
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
  return workOrderInputSchema.safeParse(raw);
}

export async function createWorkOrderAction(
  _prev: WorkOrderFormState,
  formData: FormData,
): Promise<WorkOrderFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('work_orders')
    .insert({
      tenant_id: ctx.tenantId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      ...parsed.data,
    })
    .select('id, title, assignee_id')
    .single();

  if (error || !data) return { error: friendlyDbMessage(error?.message) };

  const assigneeUserId = await resolveEmployeeUserId(data.assignee_id);
  if (assigneeUserId && assigneeUserId !== ctx.userId) {
    await createNotification({
      userId: assigneeUserId,
      kind: 'work_order_assigned',
      subject: `Neuer Auftrag: ${data.title}`,
      body: parsed.data.description ?? null,
      entityType: 'work_order',
      entityId: data.id,
    });
  }

  revalidatePath('/work-orders');
  redirect(`/work-orders/${data.id}`);
}

export async function updateWorkOrderAction(
  workOrderId: string,
  _prev: WorkOrderFormState,
  formData: FormData,
): Promise<WorkOrderFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();

  const beforeRes = await supabase
    .from('work_orders')
    .select('assignee_id')
    .eq('id', workOrderId)
    .maybeSingle();
  const before = unwrapMaybeRow(beforeRes, 'Auftraege: Auftrag vor der Bearbeitung');

  const { error } = await supabase
    .from('work_orders')
    .update({ ...parsed.data, updated_by: ctx.userId })
    .eq('id', workOrderId);
  if (error) return { error: friendlyDbMessage(error.message) };

  if (parsed.data.assignee_id && parsed.data.assignee_id !== before?.assignee_id) {
    const newAssigneeUserId = await resolveEmployeeUserId(parsed.data.assignee_id);
    if (newAssigneeUserId && newAssigneeUserId !== ctx.userId) {
      await createNotification({
        userId: newAssigneeUserId,
        kind: 'work_order_assigned',
        subject: `Auftrag zugewiesen: ${parsed.data.title}`,
        body: parsed.data.description ?? null,
        entityType: 'work_order',
        entityId: workOrderId,
      });
    }
  }

  revalidatePath('/work-orders');
  revalidatePath(`/work-orders/${workOrderId}`);
  redirect(`/work-orders/${workOrderId}`);
}

export async function setWorkOrderStatusAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const workOrderId = String(formData.get('work_order_id') ?? '');
  const status = workOrderStatusSchema.parse(formData.get('status'));

  const supabase = await createSupabaseServerClient();
  const patch: {
    status: WorkOrderStatus;
    updated_by: string;
    closed_at?: string | null;
    closed_by?: string | null;
  } = { status, updated_by: ctx.userId };
  if (status === 'done') {
    patch.closed_at = new Date().toISOString();
    patch.closed_by = ctx.userId;
  } else {
    patch.closed_at = null;
    patch.closed_by = null;
  }

  const { error } = await supabase.from('work_orders').update(patch).eq('id', workOrderId);
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/work-orders');
  revalidatePath(`/work-orders/${workOrderId}`);
}

export async function assignWorkOrderAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const workOrderId = String(formData.get('work_order_id') ?? '');
  const rawAssignee = String(formData.get('assignee_id') ?? '');
  const assignee_id = rawAssignee.length > 0 ? rawAssignee : null;

  const supabase = await createSupabaseServerClient();

  const beforeRes = await supabase
    .from('work_orders')
    .select('assignee_id, title')
    .eq('id', workOrderId)
    .maybeSingle();
  const before = unwrapMaybeRow(beforeRes, 'Auftraege: Auftrag vor der Zuweisung');

  const { error } = await supabase
    .from('work_orders')
    .update({ assignee_id, updated_by: ctx.userId })
    .eq('id', workOrderId);
  if (error) throw new Error(friendlyDbMessage(error.message));

  if (assignee_id && assignee_id !== before?.assignee_id) {
    const newAssigneeUserId = await resolveEmployeeUserId(assignee_id);
    if (newAssigneeUserId && newAssigneeUserId !== ctx.userId) {
      await createNotification({
        userId: newAssigneeUserId,
        kind: 'work_order_assigned',
        subject: `Auftrag zugewiesen: ${before?.title ?? ''}`.trim(),
        body: null,
        entityType: 'work_order',
        entityId: workOrderId,
      });
    }
  }

  revalidatePath(`/work-orders/${workOrderId}`);
}

function friendlyDbMessage(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für diese Aktion.';
  if (msg.includes('violates foreign key'))
    return 'Verweis auf Objekt oder Mitarbeiter ist ungültig.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}
