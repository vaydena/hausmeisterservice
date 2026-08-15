import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { BillingDocumentForm } from '../../../billing-form';
import { updateOfferAction } from '../../../actions';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Angebot bearbeiten' };

export default async function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('billing.edit')) notFound();

  const supabase = await createSupabaseServerClient();
  const offerRes = await supabase
    .from('offers')
    .select(
      'id, title, description, status, bill_to_name, bill_to_address, property_id, owner_id, issued_at, valid_until, notes',
    )
    .eq('id', id)
    .maybeSingle();
  const offer = unwrapMaybeRow(offerRes, 'Abrechnung: offers');
  if (!offer) notFound();
  if (offer.status !== 'draft') notFound();

  const [propertiesRes, ownersRes] = await Promise.all([
    supabase.from('properties').select('id, name').is('deleted_at', null).order('name'),
    supabase
      .from('owners')
      .select('id, kind, first_name, last_name, company_name')
      .is('deleted_at', null)
      .order('company_name'),
  ]);
  const properties = unwrapRows(propertiesRes, 'Abrechnung: properties');
  const owners = unwrapRows(ownersRes, 'Abrechnung: owners');

  const ownerOpts = owners.map((o) => ({
    id: o.id,
    label:
      o.kind === 'company'
        ? (o.company_name ?? '—')
        : `${o.first_name ?? ''} ${o.last_name ?? ''}`.trim() || '—',
  }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Angebot bearbeiten" description="Nur Entwürfe können bearbeitet werden." />
      <BillingDocumentForm
        action={updateOfferAction}
        cancelHref={`/billing/offers/${offer.id}`}
        submitLabel="Speichern"
        kind="offer"
        properties={properties}
        owners={ownerOpts}
        initial={{
          id: offer.id,
          title: offer.title,
          description: offer.description,
          property_id: offer.property_id,
          owner_id: offer.owner_id,
          bill_to_name: offer.bill_to_name,
          bill_to_address: offer.bill_to_address,
          issued_at: offer.issued_at,
          valid_until: offer.valid_until,
          notes: offer.notes,
        }}
      />
    </div>
  );
}
