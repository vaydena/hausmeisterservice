import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { ResidentForm } from '../resident-form';
import { createResidentAction } from '../actions';

export const metadata: Metadata = { title: 'Neuer Bewohner' };

export default async function NewResidentPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('residents.create')) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: properties }, { data: buildings }, { data: units }] = await Promise.all([
    supabase
      .from('properties')
      .select('id, name, code')
      .is('deleted_at', null)
      .order('name'),
    supabase.from('buildings').select('id, property_id, name').order('name'),
    supabase.from('units').select('id, building_id, property_id, code').order('code'),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Neuer Bewohner"
        description="Stammdaten erfassen und optional einer Einheit zuordnen."
      />
      <ResidentForm
        action={createResidentAction}
        cancelHref="/people/residents"
        submitLabel="Bewohner anlegen"
        properties={properties ?? []}
        buildings={buildings ?? []}
        units={units ?? []}
      />
    </div>
  );
}
