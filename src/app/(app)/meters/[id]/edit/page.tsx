import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { MeterForm } from '../../meter-form';
import { updateMeterAction, type MeterFormState } from '../../actions';

export const metadata: Metadata = { title: 'Zähler bearbeiten' };

export default async function EditMeterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('meters.edit')) notFound();

  const supabase = await createSupabaseServerClient();
  // Sprint 111: ein verschluckter Lesefehler wurde hier zu notFound() —
  // "diesen Zähler gibt es nicht" statt "die Abfrage ist gescheitert".
  const meter = unwrapMaybeRow(
    await supabase
      .from('meters')
      .select(
        'id, label, meter_number, utility_kind, unit_of_measure, property_id, building_id, unit_id, location_note, digits_before, digits_after, installed_at, last_replacement_at, notes',
      )
      .eq('id', id)
      .maybeSingle(),
    'Zähler bearbeiten: Stammdaten',
  );

  if (!meter) notFound();

  // Ohne Objektliste ist das Formular nicht absendbar (property_id ist
  // Pflicht) — als leeres Select sieht das aus wie "keine Objekte angelegt".
  const [properties, buildings, units] = await Promise.all([
    supabase
      .from('properties')
      .select('id, name, code')
      .is('deleted_at', null)
      .order('name')
      .then((r) => unwrapRows(r, 'Zähler bearbeiten: Objekte')),
    supabase
      .from('buildings')
      .select('id, property_id, name')
      .order('name')
      .then((r) => unwrapRows(r, 'Zähler bearbeiten: Gebäude')),
    supabase
      .from('units')
      .select('id, building_id, property_id, code')
      .order('code')
      .then((r) => unwrapRows(r, 'Zähler bearbeiten: Einheiten')),
  ]);

  const boundAction = updateMeterAction.bind(null, id);
  const wrapped = async (prev: MeterFormState, form: FormData) => boundAction(prev, form);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Zähler bearbeiten" description={meter.label} />
      <MeterForm
        action={wrapped}
        cancelHref={`/meters/${id}`}
        submitLabel="Änderungen speichern"
        properties={properties}
        buildings={buildings}
        units={units}
        initial={meter}
      />
    </div>
  );
}
