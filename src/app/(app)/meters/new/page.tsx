import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { MeterForm } from '../meter-form';
import { createMeterAction } from '../actions';

export const metadata: Metadata = { title: 'Neuer Zähler' };

export default async function NewMeterPage({
  searchParams,
}: {
  searchParams: Promise<{ property_id?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('meters.create')) notFound();

  const supabase = await createSupabaseServerClient();
  // Sprint 111: ohne Objektliste ist das Formular nicht absendbar
  // (property_id ist Pflicht). Ein leeres Select sah aus wie "noch keine
  // Objekte angelegt" statt nach einer Störung.
  const [properties, buildings, units] = await Promise.all([
    supabase
      .from('properties')
      .select('id, name, code')
      .is('deleted_at', null)
      .order('name')
      .then((r) => unwrapRows(r, 'Neuer Zähler: Objekte')),
    supabase
      .from('buildings')
      .select('id, property_id, name')
      .order('name')
      .then((r) => unwrapRows(r, 'Neuer Zähler: Gebäude')),
    supabase
      .from('units')
      .select('id, building_id, property_id, code')
      .order('code')
      .then((r) => unwrapRows(r, 'Neuer Zähler: Einheiten')),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Neuer Zähler"
        description="Zähler im Bestand erfassen — Ablesungen werden danach im Detail protokolliert."
      />
      <MeterForm
        action={createMeterAction}
        cancelHref="/meters"
        submitLabel="Zähler anlegen"
        properties={properties}
        buildings={buildings}
        units={units}
        defaultPropertyId={params.property_id}
      />
    </div>
  );
}
