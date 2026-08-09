import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { CorrectionForm } from './correction-form';

export const metadata: Metadata = { title: 'Korrekturantrag' };

export default async function RequestCorrectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('time_tracking.edit')) redirect('/time-tracking');

  const supabase = await createSupabaseServerClient();
  const { data: entry } = await supabase
    .from('time_entries')
    .select('id, user_id, kind, start_at, end_at, work_order_id, property_id, note')
    .eq('id', id)
    .maybeSingle();

  if (!entry) notFound();

  const isOwn = entry.user_id === ctx.userId;
  if (!isOwn && !permissions.has('time_tracking.view_others')) {
    redirect('/time-tracking');
  }

  const [propsRes, workOrdersRes] = await Promise.all([
    supabase.from('properties').select('id, code, name').is('deleted_at', null).order('name'),
    supabase
      .from('work_orders')
      .select('id, code, title')
      .is('deleted_at', null)
      .order('planned_start', { ascending: true, nullsFirst: false })
      .limit(100),
  ]);

  const workOrderOptions = (workOrdersRes.data ?? []).map((w) => ({
    id: w.id,
    label: w.code ? `${w.code} · ${w.title}` : w.title,
  }));
  const propertyOptions = (propsRes.data ?? []).map((p) => ({
    id: p.id,
    label: p.code ? `${p.code} · ${p.name}` : p.name,
  }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Korrektur beantragen"
        description={
          isOwn
            ? 'Ihr Antrag wird von einer berechtigten Person geprüft und ggf. freigegeben.'
            : 'Antrag im Namen eines Mitarbeiters — wird nach Freigabe angewandt.'
        }
      />
      <CorrectionForm
        entry={entry}
        workOrders={workOrderOptions}
        properties={propertyOptions}
        onCancelHref={`/time-tracking/${entry.id}/edit`}
      />
    </div>
  );
}
