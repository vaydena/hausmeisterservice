import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { MaterialForm } from '../../material-form';
import { updateMaterialAction, type MaterialFormState } from '../../actions';

export const metadata: Metadata = { title: 'Artikel bearbeiten' };

export default async function EditMaterialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('materials.edit')) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: material } = await supabase
    .from('materials')
    .select(
      'id, label, sku, category, unit, min_stock, unit_cost, storage_location, supplier, notes',
    )
    .eq('id', id)
    .maybeSingle();

  if (!material) notFound();

  const boundAction = updateMaterialAction.bind(null, id);
  const wrapped = async (prev: MaterialFormState, form: FormData) => boundAction(prev, form);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title="Artikel bearbeiten" description={material.label} />
      <MaterialForm
        action={wrapped}
        cancelHref={`/materials/${id}`}
        submitLabel="Änderungen speichern"
        initial={material}
      />
    </div>
  );
}
