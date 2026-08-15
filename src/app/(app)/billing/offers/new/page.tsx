import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { BillingDocumentForm } from '../../billing-form';
import { createOfferAction } from '../../actions';
import { unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Neues Angebot' };

export default async function NewOfferPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('billing.create')) notFound();

  const supabase = await createSupabaseServerClient();
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
      <PageHeader
        title="Neues Angebot"
        description="Beleg-Kopf anlegen. Positionen werden auf der Detail-Seite ergänzt."
      />
      <BillingDocumentForm
        action={createOfferAction}
        cancelHref="/billing/offers"
        submitLabel="Angebot anlegen"
        kind="offer"
        properties={properties}
        owners={ownerOpts}
      />
    </div>
  );
}
