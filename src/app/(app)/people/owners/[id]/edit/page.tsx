import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { ownerDisplayName } from '@/lib/schemas/owners';
import { OwnerForm } from '../../owner-form';
import { updateOwnerAction, type OwnerFormState } from '../../actions';

export const metadata: Metadata = { title: 'Eigentümer bearbeiten' };

export default async function EditOwnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('owners.edit')) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: owner } = await supabase
    .from('owners')
    .select(
      'id, kind, first_name, last_name, company_name, email, phone, street, house_number, postal_code, city, country, notes',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!owner) notFound();

  const action = async (prev: OwnerFormState, form: FormData) =>
    updateOwnerAction(id, prev, form);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Eigentümer bearbeiten" description={ownerDisplayName(owner)} />
      <OwnerForm
        action={action}
        cancelHref={`/people/owners/${id}`}
        submitLabel="Änderungen speichern"
        initial={owner}
      />
    </div>
  );
}
