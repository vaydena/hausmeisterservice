import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { BillingDocumentForm } from '../../billing-form';
import { createInvoiceAction } from '../../actions';
import { unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Neue Rechnung' };

export default async function NewInvoicePage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('billing.create')) notFound();

  const supabase = await createSupabaseServerClient();
  const [propertiesRes, ownersRes, workOrdersRes, offersRes] = await Promise.all([
    supabase.from('properties').select('id, name').is('deleted_at', null).order('name'),
    supabase
      .from('owners')
      .select('id, kind, first_name, last_name, company_name')
      .is('deleted_at', null)
      .order('company_name'),
    supabase
      .from('work_orders')
      .select('id, code, title')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('offers')
      .select('id, code, title')
      .eq('status', 'accepted')
      .order('issued_at', { ascending: false })
      .limit(50),
  ]);
  const properties = unwrapRows(propertiesRes, 'Abrechnung: properties');
  const owners = unwrapRows(ownersRes, 'Abrechnung: owners');
  const workOrders = unwrapRows(workOrdersRes, 'Abrechnung: work_orders');
  const offers = unwrapRows(offersRes, 'Abrechnung: offers');

  const ownerOpts = owners.map((o) => ({
    id: o.id,
    label:
      o.kind === 'company'
        ? (o.company_name ?? '—')
        : `${o.first_name ?? ''} ${o.last_name ?? ''}`.trim() || '—',
  }));
  const woOpts = workOrders.map((w) => ({
    id: w.id,
    label: `${w.code} · ${w.title}`,
  }));
  const offerOpts = offers.map((o) => ({
    id: o.id,
    label: `${o.code} · ${o.title}`,
  }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Neue Rechnung"
        description="Beleg-Kopf anlegen. Positionen werden auf der Detail-Seite ergänzt."
      />
      <BillingDocumentForm
        action={createInvoiceAction}
        cancelHref="/billing/invoices"
        submitLabel="Rechnung anlegen"
        kind="invoice"
        properties={properties}
        owners={ownerOpts}
        workOrders={woOpts}
        offers={offerOpts}
      />
    </div>
  );
}
