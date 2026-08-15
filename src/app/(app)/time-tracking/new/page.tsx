import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { toDateTimeLocalInput } from '@/lib/schemas/time-tracking';
import { EntryForm } from '../entry-form';
import { createManualEntryAction } from '../actions';

export const metadata: Metadata = { title: 'Zeit manuell erfassen' };

export default async function NewTimeEntryPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('time_tracking.create')) redirect('/time-tracking');

  const supabase = await createSupabaseServerClient();
  const [propsRes, workOrdersRes] = await Promise.all([
    supabase.from('properties').select('id, code, name').is('deleted_at', null).order('name'),
    supabase
      .from('work_orders')
      .select('id, code, title')
      .is('deleted_at', null)
      .in('status', ['new', 'planned', 'in_progress'])
      .order('planned_start', { ascending: true, nullsFirst: false })
      .limit(50),
  ]);

  const now = new Date();
  const start = new Date(now);
  start.setMinutes(start.getMinutes() - 60);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Zeit manuell erfassen"
        description="Für Nachträge oder Zeiten, die nicht per Stempel erfasst wurden."
      />
      <EntryForm
        action={createManualEntryAction}
        mode="create"
        defaults={{
          kind: 'work',
          start_at: toDateTimeLocalInput(start.toISOString()),
          end_at: toDateTimeLocalInput(now.toISOString()),
          work_order_id: '',
          property_id: '',
          note: '',
        }}
        workOrders={unwrapRows(workOrdersRes, 'Zeit nacherfassen: Auftragsauswahl').map((w) => ({
          id: w.id,
          label: w.code ? `${w.code} · ${w.title}` : w.title,
        }))}
        properties={unwrapRows(propsRes, 'Zeit nacherfassen: Objektauswahl').map((p) => ({
          id: p.id,
          label: p.code ? `${p.code} · ${p.name}` : p.name,
        }))}
        onCancelHref="/time-tracking"
      />
    </div>
  );
}
