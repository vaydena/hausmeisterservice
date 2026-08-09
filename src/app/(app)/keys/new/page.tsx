import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { KeyForm } from '../key-form';
import { createKeyAction } from '../actions';

export const metadata: Metadata = { title: 'Neuer Schlüssel' };

export default async function NewKeyPage({
  searchParams,
}: {
  searchParams: Promise<{ property_id?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('keys.create')) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: properties }, { data: buildings }, { data: units }] = await Promise.all([
    supabase.from('properties').select('id, name, code').is('deleted_at', null).order('name'),
    supabase.from('buildings').select('id, property_id, name').order('name'),
    supabase.from('units').select('id, building_id, property_id, code').order('code'),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Neuer Schlüssel"
        description="Schlüssel im Bestand erfassen — Ausgabe/Rückgabe wird danach im Detail protokolliert."
      />
      <KeyForm
        action={createKeyAction}
        cancelHref="/keys"
        submitLabel="Schlüssel anlegen"
        properties={properties ?? []}
        buildings={buildings ?? []}
        units={units ?? []}
        defaultPropertyId={params.property_id}
      />
    </div>
  );
}
