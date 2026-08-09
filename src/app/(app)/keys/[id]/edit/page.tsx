import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { KeyForm } from '../../key-form';
import { updateKeyAction, type KeyFormState } from '../../actions';

export const metadata: Metadata = { title: 'Schlüssel bearbeiten' };

export default async function EditKeyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('keys.edit')) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: key } = await supabase
    .from('keys')
    .select(
      'id, label, identifier, kind, property_id, building_id, unit_id, copies_total, storage_location, notes',
    )
    .eq('id', id)
    .maybeSingle();

  if (!key) notFound();

  const [{ data: properties }, { data: buildings }, { data: units }] = await Promise.all([
    supabase.from('properties').select('id, name, code').is('deleted_at', null).order('name'),
    supabase.from('buildings').select('id, property_id, name').order('name'),
    supabase.from('units').select('id, building_id, property_id, code').order('code'),
  ]);

  const boundAction = updateKeyAction.bind(null, id);
  const wrapped = async (prev: KeyFormState, form: FormData) => boundAction(prev, form);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Schlüssel bearbeiten" description={key.label} />
      <KeyForm
        action={wrapped}
        cancelHref={`/keys/${id}`}
        submitLabel="Änderungen speichern"
        properties={properties ?? []}
        buildings={buildings ?? []}
        units={units ?? []}
        initial={key}
      />
    </div>
  );
}
