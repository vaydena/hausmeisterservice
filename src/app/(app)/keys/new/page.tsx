import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
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
  // Sprint 110: Ohne Objektliste ist das Formular nicht absendbar (property_id
  // ist Pflicht) — der Nutzer haette gelesen "Sie haben noch keine Objekte
  // angelegt", obwohl es sie gibt.
  const [properties, buildings, units] = await Promise.all([
    supabase
      .from('properties')
      .select('id, name, code')
      .is('deleted_at', null)
      .order('name')
      .then((r) => unwrapRows(r, 'Neuer Schlüssel: Objekte')),
    supabase
      .from('buildings')
      .select('id, property_id, name')
      .order('name')
      .then((r) => unwrapRows(r, 'Neuer Schlüssel: Gebäude')),
    supabase
      .from('units')
      .select('id, building_id, property_id, code')
      .order('code')
      .then((r) => unwrapRows(r, 'Neuer Schlüssel: Einheiten')),
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
        properties={properties}
        buildings={buildings}
        units={units}
        defaultPropertyId={params.property_id}
      />
    </div>
  );
}
