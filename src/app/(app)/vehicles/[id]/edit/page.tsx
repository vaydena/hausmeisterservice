import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
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
  const [{ data: vehicle }, { data: users }] = await Promise.all([
    supabase
      .from('vehicles')
      .select(
        'id, license_plate, make, model, vehicle_type, fuel_type, year, vin, mileage_km, primary_driver_user_id, next_tuev_at, next_service_at, next_service_due_km, insurance_expires_at, storage_location, notes',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase.from('users').select('id, display_name').order('display_name'),
  ]);

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
        users={users ?? []}
        initial={vehicle}
      />
    </div>
  );
}
