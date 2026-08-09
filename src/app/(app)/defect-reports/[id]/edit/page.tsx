import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { ReportForm } from '../../report-form';
import { updateDefectReportAction, type DefectReportFormState } from '../../actions';

export const metadata: Metadata = { title: 'Meldung bearbeiten' };

export default async function EditDefectReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('defect_reports.edit')) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: report } = await supabase
    .from('defect_reports')
    .select(
      'id, title, description, category, priority, property_id, building_id, unit_id, location_details, reporter_kind, reporter_name, reporter_contact, status',
    )
    .eq('id', id)
    .maybeSingle();

  if (!report) notFound();
  if (report.status === 'converted') notFound();

  const [{ data: properties }, { data: buildings }, { data: units }] = await Promise.all([
    supabase
      .from('properties')
      .select('id, name, code')
      .is('deleted_at', null)
      .order('name'),
    supabase.from('buildings').select('id, property_id, name').order('name'),
    supabase.from('units').select('id, building_id, property_id, code').order('code'),
  ]);

  const action = async (prev: DefectReportFormState, form: FormData) =>
    updateDefectReportAction(id, prev, form);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Meldung bearbeiten" description={report.title} />
      <ReportForm
        action={action}
        cancelHref={`/defect-reports/${id}`}
        submitLabel="Änderungen speichern"
        properties={properties ?? []}
        buildings={buildings ?? []}
        units={units ?? []}
        initial={report}
      />
    </div>
  );
}
