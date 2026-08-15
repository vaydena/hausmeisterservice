import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { WorkOrderForm } from '../work-order-form';
import { createWorkOrderAction } from '../actions';
import { EmptyState } from '@/components/ui/empty-state';
import { LinkButton } from '@/components/ui/button';
import { unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Neuer Auftrag' };

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ property_id?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('work_orders.create')) notFound();

  const supabase = await createSupabaseServerClient();
  const [propertiesRes, employeesRes] = await Promise.all([
    supabase.from('properties').select('id, name, code').is('deleted_at', null).order('name'),
    supabase.from('employees').select('id, user_id').eq('employment_status', 'active'),
  ]);
  const properties = unwrapRows(propertiesRes, 'Auftraege: properties');
  const employees = unwrapRows(employeesRes, 'Auftraege: employees');

  if (!properties || properties.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <PageHeader title="Neuer Auftrag" />
        <EmptyState
          title="Zuerst ein Objekt anlegen"
          description="Aufträge werden immer einer Liegenschaft zugeordnet. Legen Sie zuerst mindestens ein Objekt an."
          action={
            permissions.has('properties.create') ? (
              <LinkButton href="/properties/new">Objekt anlegen</LinkButton>
            ) : undefined
          }
        />
      </div>
    );
  }

  // Namen der Mitarbeiter für Assignee-Dropdown
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Neuer Auftrag"
        description="Auftrag anlegen und optional direkt zuweisen."
      />
      <WorkOrderForm
        action={createWorkOrderAction}
        cancelHref="/work-orders"
        submitLabel="Auftrag anlegen"
        properties={properties}
        employees={employeeOptions}
        defaultPropertyId={params.property_id}
      />
    </div>
  );
}
