import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { PlanForm } from '../plan-form';
import { createMaintenancePlanAction } from '../actions';

export const metadata: Metadata = { title: 'Neuer Wartungsplan' };

export default async function NewMaintenancePlanPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('maintenance.create')) notFound();

  const supabase = await createSupabaseServerClient();
  // Sprint 109: Objekt ist ein Pflichtfeld. Eine leere Auswahlliste sah aus
  // wie "es sind noch keine Objekte angelegt" — und der Prueftermin, den
  // jemand gerade eintragen wollte, liess sich schlicht nicht speichern.
  const [propertiesRes, buildingsRes, unitsRes] = await Promise.all([
    supabase
      .from('properties')
      .select('id, name, code')
      .is('deleted_at', null)
      .order('name'),
    supabase.from('buildings').select('id, property_id, name').order('name'),
    supabase.from('units').select('id, building_id, property_id, code').order('code'),
  ]);

  const properties = unwrapRows(propertiesRes, 'Neuer Wartungsplan: Objektauswahl');
  const buildings = unwrapRows(buildingsRes, 'Neuer Wartungsplan: Gebäudeauswahl');
  const units = unwrapRows(unitsRes, 'Neuer Wartungsplan: Einheitenauswahl');

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Neuer Wartungsplan"
        description="Wiederkehrenden Wartungs- oder Prüftermin definieren."
      />
      <PlanForm
        action={createMaintenancePlanAction}
        cancelHref="/maintenance"
        submitLabel="Wartungsplan anlegen"
        properties={properties}
        buildings={buildings}
        units={units}
      />
    </div>
  );
}
