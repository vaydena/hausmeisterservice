import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { WorkOrderForm } from '../../work-order-form';
import { updateWorkOrderAction, type WorkOrderFormState } from '../../actions';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Auftrag bearbeiten' };

export default async function EditWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('work_orders.edit')) notFound();

  const supabase = await createSupabaseServerClient();
  const [woRes, propertiesRes, employeesRes] = await Promise.all([
    supabase
      .from('work_orders')
      .select(
        'id, title, description, category, priority, property_id, building_id, unit_id, assignee_id, planned_start, planned_end, deadline, estimated_minutes, is_emergency',
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase.from('properties').select('id, name, code').is('deleted_at', null).order('name'),
    supabase.from('employees').select('id, user_id').eq('employment_status', 'active'),
  ]);
  const wo = unwrapMaybeRow(woRes, 'Auftraege: work_orders');
  const properties = unwrapRows(propertiesRes, 'Auftraege: properties');
  const employees = unwrapRows(employeesRes, 'Auftraege: employees');

  if (!wo) notFound();

  const userIds = employees.map((e) => e.user_id);
  const usersRes =
    userIds.length > 0
      ? await supabase.from('users').select('id, display_name').in('id', userIds)
      : { data: [], error: null };
  const users = unwrapRows(usersRes, 'Auftraege: users');
  const nameById = new Map(users.map((u) => [u.id, u.display_name]));
  const employeeOptions = employees.map((e) => ({
    id: e.id,
    display_name: nameById.get(e.user_id) ?? '(Ohne Namen)',
  }));

  const action = async (prev: WorkOrderFormState, form: FormData) =>
    updateWorkOrderAction(id, prev, form);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title="Auftrag bearbeiten" description={wo.title} />
      <WorkOrderForm
        action={action}
        cancelHref={`/work-orders/${id}`}
        submitLabel="Änderungen speichern"
        properties={properties}
        employees={employeeOptions}
        initial={wo}
      />
    </div>
  );
}
