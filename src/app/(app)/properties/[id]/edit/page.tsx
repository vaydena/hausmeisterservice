import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { PropertyForm } from '../../property-form';
import { updatePropertyAction, type PropertyFormState } from '../../actions';

export const metadata: Metadata = { title: 'Objekt bearbeiten' };

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('properties.edit')) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: property } = await supabase
    .from('properties')
    .select(
      'id, code, name, property_type, street, house_number, postal_code, city, country, gps_lat, gps_lng, notes, access_notes, emergency_notes',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!property) notFound();

  const action = async (prev: PropertyFormState, form: FormData) =>
    updatePropertyAction(id, prev, form);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title="Objekt bearbeiten" description={property.name} />
      <PropertyForm
        action={action}
        cancelHref={`/properties/${id}`}
        initial={property}
        submitLabel="Änderungen speichern"
      />
    </div>
  );
}
