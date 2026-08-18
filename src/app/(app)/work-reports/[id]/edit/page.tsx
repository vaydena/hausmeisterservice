import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { WorkReportForm } from '../../work-report-form';
import { updateWorkReportAction, type WorkReportFormState } from '../../actions';

export const metadata: Metadata = { title: 'Arbeitsbericht bearbeiten' };

export default async function EditWorkReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('work_reports.edit')) notFound();

  const supabase = await createSupabaseServerClient();
  const report = unwrapMaybeRow(
    await supabase
      .from('work_reports')
      .select(
        'id, code, title, property_id, work_order_id, performed_on, description, minutes_worked, material_used, status, signer_name, signature_data',
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    'Arbeitsbericht bearbeiten',
  );
  if (!report) notFound();

  // Freigegebene Berichte sind gesperrt — die Server-Action würde es ohnehin
  // ablehnen, aber die Bearbeiten-Seite gar nicht erst zu zeigen ist ehrlicher.
  if (report.status === 'approved') redirect(`/work-reports/${id}`);

  const [properties, workOrders] = await Promise.all([
    supabase
      .from('properties')
      .select('id, name, code')
      .is('deleted_at', null)
      .order('name')
      .then((r) => unwrapRows(r, 'Bericht bearbeiten: Objekte')),
    supabase
      .from('work_orders')
      .select('id, code, title, property_id')
      .order('code', { ascending: false })
      .limit(300)
      .then((r) => unwrapRows(r, 'Bericht bearbeiten: Aufträge')),
  ]);

  const workOrderOptions = workOrders.map((w) => ({
    id: w.id,
    property_id: w.property_id,
    label: w.code ? `${w.code} · ${w.title}` : w.title,
  }));

  const boundAction = updateWorkReportAction.bind(null, id);
  const wrapped = async (prev: WorkReportFormState, form: FormData) => boundAction(prev, form);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Arbeitsbericht bearbeiten" description={report.code ?? report.title} />
      <WorkReportForm
        action={wrapped}
        cancelHref={`/work-reports/${id}`}
        submitLabel="Änderungen speichern"
        properties={properties}
        workOrders={workOrderOptions}
        initial={report}
        todayIso={report.performed_on}
      />
    </div>
  );
}
