'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { workReportInputSchema } from '@/lib/schemas/work-reports';

export type WorkReportFormState = {
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
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für dieses Objekt.';
  if (msg.includes('violates foreign key')) return 'Das gewählte Objekt oder der Auftrag existiert nicht (mehr).';
  if (msg.includes('violates check constraint')) return 'Eingabe außerhalb des zulässigen Bereichs.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

export async function createWorkReportAction(
  _prev: WorkReportFormState,
  formData: FormData,
): Promise<WorkReportFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(workReportInputSchema, formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), error: 'Bitte prüfen Sie die Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('work_reports')
    .insert({
      tenant_id: ctx.tenantId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      signed_at: parsed.data.signature_data ? new Date().toISOString() : null,
      ...parsed.data,
    })
    .select('id')
    .single();

  if (error || !data) return { error: friendlyDbMessage(error?.message) };

  revalidatePath('/work-reports');
  redirect(`/work-reports/${data.id}`);
}

export async function updateWorkReportAction(
  reportId: string,
  _prev: WorkReportFormState,
  formData: FormData,
): Promise<WorkReportFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(workReportInputSchema, formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), error: 'Bitte prüfen Sie die Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();

  // Freigegebene Berichte sind gesperrt. Der Status wird serverseitig geprüft,
  // nicht nur die Oberfläche versteckt den Bearbeiten-Knopf.
  const current = unwrapMaybeRow(
    await supabase.from('work_reports').select('status').eq('id', reportId).maybeSingle(),
    'Arbeitsbericht: aktueller Status',
  );
  if (!current) return { error: 'Bericht nicht gefunden.' };
  if (current.status === 'approved') {
    return { error: 'Freigegebene Berichte sind gesperrt. Bitte zuerst zurück in den Entwurf holen.' };
  }

  const { error } = await supabase
    .from('work_reports')
    .update({
      ...parsed.data,
      signed_at: parsed.data.signature_data ? new Date().toISOString() : null,
      updated_by: ctx.userId,
    })
    .eq('id', reportId);

  if (error) return { error: friendlyDbMessage(error.message) };

  revalidatePath('/work-reports');
  revalidatePath(`/work-reports/${reportId}`);
  redirect(`/work-reports/${reportId}`);
}

export async function approveWorkReportAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const reportId = String(formData.get('report_id') ?? '');
  if (!reportId) throw new Error('Bericht fehlt.');

  // Freigabe ist ein eigenes Recht. Ohne diese Prüfung könnte jemand mit
  // reinem Bearbeitungsrecht freigeben — die UPDATE-Policy lässt beide zu.
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('work_reports.approve')) {
    throw new Error('Sie dürfen Berichte nicht freigeben.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('work_reports')
    .update({
      status: 'approved',
      approved_by: ctx.userId,
      approved_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq('id', reportId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/work-reports');
  revalidatePath(`/work-reports/${reportId}`);
}

export async function reopenWorkReportAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const reportId = String(formData.get('report_id') ?? '');
  if (!reportId) throw new Error('Bericht fehlt.');

  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('work_reports.approve')) {
    throw new Error('Sie dürfen die Freigabe nicht zurücknehmen.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('work_reports')
    .update({
      status: 'draft',
      approved_by: null,
      approved_at: null,
      updated_by: ctx.userId,
    })
    .eq('id', reportId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/work-reports');
  revalidatePath(`/work-reports/${reportId}`);
}

export async function softDeleteWorkReportAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const reportId = String(formData.get('report_id') ?? '');
  if (!reportId) throw new Error('Bericht fehlt.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('work_reports')
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', reportId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/work-reports');
  redirect('/work-reports');
}
