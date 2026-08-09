import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { TourForm } from '../../tour-form';
import { updateTourAction, type TourFormState } from '../../actions';

export const metadata: Metadata = { title: 'Tour bearbeiten' };

export default async function EditTourPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('tours.edit')) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: tour }, { data: users }, { data: vehicles }] = await Promise.all([
    supabase
      .from('tours')
      .select('id, title, planned_date, driver_user_id, vehicle_id, notes')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('users').select('id, display_name').order('display_name'),
    supabase
      .from('vehicles')
      .select('id, license_plate, make, model')
      .is('deleted_at', null)
      .order('license_plate'),
  ]);

  if (!tour) notFound();

  const boundAction = updateTourAction.bind(null, id);
  const wrapped = async (prev: TourFormState, form: FormData) => boundAction(prev, form);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Tour bearbeiten" description={tour.title} />
      <TourForm
        action={wrapped}
        cancelHref={`/tours/${id}`}
        submitLabel="Änderungen speichern"
        users={users ?? []}
        vehicles={vehicles ?? []}
        initial={tour}
      />
    </div>
  );
}
