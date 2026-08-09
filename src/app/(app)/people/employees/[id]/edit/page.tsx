import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { EmployeeEditForm } from './edit-form';
import { updateEmployeeAction, type EmployeeFormState } from '../../actions';

export const metadata: Metadata = { title: 'Mitarbeiter bearbeiten' };

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('employees.edit')) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: employee } = await supabase
    .from('employees')
    .select(
      'id, employment_status, hire_date, termination_date, hourly_rate, phone, skills, notes, user_id',
    )
    .eq('id', id)
    .maybeSingle();

  if (!employee) notFound();

  const { data: profile } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', employee.user_id)
    .maybeSingle();

  const action = async (prev: EmployeeFormState, form: FormData) =>
    updateEmployeeAction(id, prev, form);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Mitarbeiter bearbeiten"
        description={profile?.display_name ?? undefined}
      />
      <EmployeeEditForm action={action} cancelHref={`/people/employees/${id}`} initial={employee} />
    </div>
  );
}
