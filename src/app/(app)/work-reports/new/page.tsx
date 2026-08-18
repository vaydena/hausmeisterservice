import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LinkButton } from '@/components/ui/button';
import { ModuleGate } from '@/components/ui/module-link';
import { WorkReportForm } from '../work-report-form';
import { createWorkReportAction } from '../actions';

export const metadata: Metadata = { title: 'Neuer Arbeitsbericht' };

export default async function NewWorkReportPage({
  searchParams,
}: {
  searchParams: Promise<{ property_id?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('work_reports.create')) notFound();

  const supabase = await createSupabaseServerClient();
  const [properties, workOrders] = await Promise.all([
    supabase
      .from('properties')
      .select('id, name, code')
      .is('deleted_at', null)
      .order('name')
      .then((r) => unwrapRows(r, 'Neuer Bericht: Objekte')),
    supabase
      .from('work_orders')
      .select('id, code, title, property_id')
      .order('code', { ascending: false })
      .limit(300)
      .then((r) => unwrapRows(r, 'Neuer Bericht: Aufträge')),
  ]);

  if (properties.length === 0) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader title="Neuer Arbeitsbericht" description="Leistungsnachweis zu einem Objekt." />
        <EmptyState
          title="Noch kein Objekt"
          description="Ein Arbeitsbericht gehört zu einem Objekt. Legen Sie zuerst eine Liegenschaft an."
          action={
            <ModuleGate href="/properties/new">
              <LinkButton href="/properties/new">Objekt anlegen</LinkButton>
            </ModuleGate>
          }
        />
      </div>
    );
  }

  const workOrderOptions = workOrders.map((w) => ({
    id: w.id,
    property_id: w.property_id,
    label: w.code ? `${w.code} · ${w.title}` : w.title,
  }));

  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Neuer Arbeitsbericht"
        description="Dokumentieren Sie die erbrachte Leistung und lassen Sie sie vor Ort unterschreiben."
      />
      <WorkReportForm
        action={createWorkReportAction}
        cancelHref="/work-reports"
        submitLabel="Bericht anlegen"
        properties={properties}
        workOrders={workOrderOptions}
        defaultPropertyId={params.property_id}
        todayIso={todayIso}
      />
    </div>
  );
}
