import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { ResidentForm } from '../../resident-form';
import { updateResidentAction, type ResidentFormState } from '../../actions';

export const metadata: Metadata = { title: 'Bewohner bearbeiten' };

export default async function EditResidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('residents.edit')) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: resident } = await supabase
    .from('residents')
    .select(
      'id, first_name, last_name, email, phone, property_id, building_id, unit_id, moved_in, moved_out, notes',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!resident) notFound();

  const [{ data: properties }, { data: buildings }, { data: units }] = await Promise.all([
    supabase
      .from('properties')
      .select('id, name, code')
      .is('deleted_at', null)
      .order('name'),
    supabase.from('buildings').select('id, property_id, name').order('name'),
    supabase.from('units').select('id, building_id, property_id, code').order('code'),
  ]);

  const action = async (prev: ResidentFormState, form: FormData) =>
    updateResidentAction(id, prev, form);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Bewohner bearbeiten" description={`${resident.first_name} ${resident.last_name}`} />
      <ResidentForm
        action={action}
        cancelHref={`/people/residents/${id}`}
        submitLabel="Änderungen speichern"
        properties={properties ?? []}
        buildings={buildings ?? []}
        units={units ?? []}
        initial={resident}
      />
    </div>
  );
}
