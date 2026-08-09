'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { createNotifications } from '@/lib/notifications/create';
import { listUsersWithPermission } from '@/lib/notifications/recipients';
import {
  defectReportInputSchema,
  defectReportStatusSchema,
  type DefectReportStatus,
} from '@/lib/schemas/defect-reports';

export type DefectReportFormState = {
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
  return defectReportInputSchema.safeParse(raw);
}

function friendlyDbMessage(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für diese Aktion.';
  if (msg.includes('violates foreign key')) return 'Verweis auf Objekt oder Person ist ungültig.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

export async function createDefectReportAction(
  _prev: DefectReportFormState,
  formData: FormData,
): Promise<DefectReportFormState> {
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
    .from('defect_reports')
    .insert({
      tenant_id: ctx.tenantId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      reporter_user_id: ctx.userId,
      ...parsed.data,
    })
    .select('id, title')
    .single();

  if (error || !data) return { error: friendlyDbMessage(error?.message) };

  const managers = await listUsersWithPermission(ctx.tenantId, 'defect_reports.edit');
  const recipients = managers.filter((uid) => uid !== ctx.userId);
  if (recipients.length > 0) {
    await createNotifications(recipients, {
      kind: 'defect_report_created',
      subject: `Neue Meldung: ${data.title}`,
      body: parsed.data.description?.slice(0, 500) ?? null,
      entityType: 'defect_report',
      entityId: data.id,
    });
  }

  revalidatePath('/defect-reports');
  redirect(`/defect-reports/${data.id}`);
}

export async function updateDefectReportAction(
  reportId: string,
  _prev: DefectReportFormState,
  formData: FormData,
): Promise<DefectReportFormState> {
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
    .from('defect_reports')
    .update({ ...parsed.data, updated_by: ctx.userId })
    .eq('id', reportId);

  if (error) return { error: friendlyDbMessage(error.message) };

  revalidatePath('/defect-reports');
  revalidatePath(`/defect-reports/${reportId}`);
  redirect(`/defect-reports/${reportId}`);
}

export async function setDefectReportStatusAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const reportId = String(formData.get('report_id') ?? '');
  const status: DefectReportStatus = defectReportStatusSchema.parse(formData.get('status'));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('defect_reports')
    .update({ status, updated_by: ctx.userId })
    .eq('id', reportId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/defect-reports');
  revalidatePath(`/defect-reports/${reportId}`);
}

export async function rejectDefectReportAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const reportId = String(formData.get('report_id') ?? '');
  const rawReason = String(formData.get('rejection_reason') ?? '').trim();
  const rejection_reason = rawReason.length > 0 ? rawReason.slice(0, 500) : null;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('defect_reports')
    .update({ status: 'rejected', rejection_reason, updated_by: ctx.userId })
    .eq('id', reportId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/defect-reports');
  revalidatePath(`/defect-reports/${reportId}`);
}

/**
 * Converts a defect report into a work_order. The current user needs both
 * `defect_reports.edit` (on the report's property) AND `work_orders.create`
 * (also property-scoped) — RLS enforces both.
 */
export async function convertDefectReportAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const reportId = String(formData.get('report_id') ?? '');
  if (!reportId) throw new Error('Meldung fehlt.');

  const supabase = await createSupabaseServerClient();

  const { data: report, error: reportErr } = await supabase
    .from('defect_reports')
    .select(
      'id, tenant_id, title, description, category, priority, property_id, building_id, unit_id, reporter_kind, reporter_user_id, reporter_name, location_details, status, converted_work_order_id',
    )
    .eq('id', reportId)
    .single();

  if (reportErr || !report) throw new Error('Meldung nicht gefunden.');
  if (report.converted_work_order_id) {
    throw new Error('Meldung wurde bereits in einen Auftrag überführt.');
  }
  if (report.status === 'rejected') {
    throw new Error('Abgelehnte Meldungen lassen sich nicht überführen.');
  }

  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('work_orders.create')) {
    throw new Error('Fehlende Berechtigung: Auftrag erstellen.');
  }

  const reporterKindMap: Record<string, 'employee' | 'resident' | 'owner' | 'system'> = {
    staff: 'employee',
    resident: 'resident',
    owner: 'owner',
    anonymous: 'system',
  };

  const composedDescription = [
    report.description,
    report.location_details ? `Standort: ${report.location_details}` : null,
    report.reporter_name ? `Meldender: ${report.reporter_name}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  const { data: order, error: orderErr } = await supabase
    .from('work_orders')
    .insert({
      tenant_id: ctx.tenantId,
      title: report.title,
      description: composedDescription.length > 0 ? composedDescription : null,
      category: report.category,
      priority: report.priority,
      status: 'new',
      property_id: report.property_id,
      building_id: report.building_id,
      unit_id: report.unit_id,
      reporter_kind: reporterKindMap[report.reporter_kind] ?? 'system',
      reporter_id: report.reporter_user_id,
      reporter_note: `Aus Mängelmeldung übernommen`,
      is_emergency: report.priority === 'emergency',
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single();

  if (orderErr || !order) throw new Error(friendlyDbMessage(orderErr?.message));

  const { error: updateErr } = await supabase
    .from('defect_reports')
    .update({
      status: 'converted',
      converted_work_order_id: order.id,
      updated_by: ctx.userId,
    })
    .eq('id', reportId);

  if (updateErr) throw new Error(friendlyDbMessage(updateErr.message));

  revalidatePath('/defect-reports');
  revalidatePath(`/defect-reports/${reportId}`);
  revalidatePath('/work-orders');
  redirect(`/work-orders/${order.id}`);
}
