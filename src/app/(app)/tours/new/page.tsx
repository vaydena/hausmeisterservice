import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { TourForm } from '../tour-form';
import { createTourAction } from '../actions';

export const metadata: Metadata = { title: 'Neue Tour' };

export default async function NewTourPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('tours.create')) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: users }, { data: vehicles }] = await Promise.all([
    supabase.from('users').select('id, display_name').order('display_name'),
    supabase
      .from('vehicles')
      .select('id, license_plate, make, model')
      .is('deleted_at', null)
      .order('license_plate'),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Neue Tour" description="Kopf-Stammdaten festlegen; Stopps folgen im Detail." />
      <TourForm
        action={createTourAction}
        cancelHref="/tours"
        submitLabel="Tour anlegen"
        users={users ?? []}
        vehicles={vehicles ?? []}
      />
    </div>
  );
}
