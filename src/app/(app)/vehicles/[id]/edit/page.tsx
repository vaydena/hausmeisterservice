import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows, unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { VehicleForm } from '../../vehicle-form';
import { updateVehicleAction, type VehicleFormState } from '../../actions';

export const metadata: Metadata = { title: 'Fahrzeug bearbeiten' };

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('vehicles.edit')) notFound();

  const supabase = await createSupabaseServerClient();
  // Sprint 109: Dieses Formular traegt die Fristen-Felder. Ohne
  // Fehlerpruefung wurde aus einer Stoerung ein notFound() — und wer hier
  // gerade ein neues TUEV-Datum eintragen wollte, bekam die Auskunft, das
  // Fahrzeug gebe es nicht.
  const [vehicleRes, usersRes] = await Promise.all([
    supabase
      .from('vehicles')
      .select(
        'id, license_plate, make, model, vehicle_type, fuel_type, year, vin, mileage_km, primary_driver_user_id, next_tuev_at, next_service_at, next_service_due_km, insurance_expires_at, storage_location, notes',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase.from('users').select('id, display_name').order('display_name'),
  ]);

  const vehicle = unwrapMaybeRow(vehicleRes, 'Fahrzeug zur Bearbeitung');
  const users = unwrapRows(usersRes, 'Fahrzeug: Fahrerauswahl');

  if (!vehicle) notFound();

  const boundAction = updateVehicleAction.bind(null, id);
  const wrapped = async (prev: VehicleFormState, form: FormData) => boundAction(prev, form);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Fahrzeug bearbeiten"
        description={`${vehicle.make} ${vehicle.model} · ${vehicle.license_plate}`}
      />
      <VehicleForm
        action={wrapped}
        cancelHref={`/vehicles/${id}`}
        submitLabel="Änderungen speichern"
        users={users}
        initial={vehicle}
      />
    </div>
  );
}
