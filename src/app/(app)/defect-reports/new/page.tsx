import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { ReportForm } from '../report-form';
import { createDefectReportAction } from '../actions';
import { unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Neue Meldung' };

export default async function NewDefectReportPage({
  searchParams,
}: {
  searchParams: Promise<{ property_id?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('defect_reports.create')) notFound();

  const supabase = await createSupabaseServerClient();
  const [propertiesRes, buildingsRes, unitsRes] = await Promise.all([
    supabase.from('properties').select('id, name, code').is('deleted_at', null).order('name'),
    supabase.from('buildings').select('id, property_id, name').order('name'),
    supabase.from('units').select('id, building_id, property_id, code').order('code'),
  ]);
  const properties = unwrapRows(propertiesRes, 'Maengelmeldungen: properties');
  const buildings = unwrapRows(buildingsRes, 'Maengelmeldungen: buildings');
  const units = unwrapRows(unitsRes, 'Maengelmeldungen: units');

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Neue Mängelmeldung"
        description="Meldung erfassen — sie wird geprüft und ggf. in einen Auftrag überführt."
      />
      <ReportForm
        action={createDefectReportAction}
        cancelHref="/defect-reports"
        submitLabel="Meldung erfassen"
        properties={properties}
        buildings={buildings}
        units={units}
        defaultPropertyId={params.property_id}
      />
    </div>
  );
}
