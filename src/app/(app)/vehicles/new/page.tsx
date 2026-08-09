import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { VehicleForm } from '../vehicle-form';
import { createVehicleAction } from '../actions';

export const metadata: Metadata = { title: 'Neues Fahrzeug' };

export default async function NewVehiclePage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('vehicles.create')) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: users } = await supabase.from('users').select('id, display_name').order('display_name');

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Neues Fahrzeug" description="Fuhrpark-Stammdaten erfassen." />
      <VehicleForm
        action={createVehicleAction}
        cancelHref="/vehicles"
        submitLabel="Fahrzeug anlegen"
        users={users ?? []}
      />
    </div>
  );
}
