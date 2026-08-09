import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { PlanForm } from '../../plan-form';
import { updateMaintenancePlanAction, type MaintenancePlanFormState } from '../../actions';

export const metadata: Metadata = { title: 'Wartungsplan bearbeiten' };

export default async function EditMaintenancePlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('maintenance.edit')) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: plan } = await supabase
    .from('maintenance_plans')
    .select(
      'id, title, description, category, property_id, building_id, unit_id, interval_days, estimated_minutes, priority, assigned_role, next_due_at, active, notes',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!plan) notFound();

  const [{ data: properties }, { data: buildings }, { data: units }] = await Promise.all([
    supabase
      .from('properties')
      .select('id, name, code')
      .is('deleted_at', null)
      .order('name'),
    supabase.from('buildings').select('id, property_id, name').order('name'),
    supabase.from('units').select('id, building_id, property_id, code').order('code'),
  ]);

  const action = async (prev: MaintenancePlanFormState, form: FormData) =>
    updateMaintenancePlanAction(id, prev, form);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Wartungsplan bearbeiten" description={plan.title} />
      <PlanForm
        action={action}
        cancelHref={`/maintenance/${id}`}
        submitLabel="Änderungen speichern"
        properties={properties ?? []}
        buildings={buildings ?? []}
        units={units ?? []}
        initial={plan}
      />
    </div>
  );
}
