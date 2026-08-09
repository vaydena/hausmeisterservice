import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { BillingDocumentForm } from '../../../billing-form';
import { updateInvoiceAction } from '../../../actions';

export const metadata: Metadata = { title: 'Rechnung bearbeiten' };

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('billing.edit')) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: invoice } = await supabase
    .from('invoices')
    .select(
      'id, title, description, status, bill_to_name, bill_to_address, property_id, owner_id, work_order_id, offer_id, issued_at, due_at, notes',
    )
    .eq('id', id)
    .maybeSingle();
  if (!invoice) notFound();
  if (invoice.status !== 'draft') notFound();

  const [{ data: properties }, { data: owners }, { data: workOrders }, { data: offers }] = await Promise.all([
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

  const ownerOpts = (owners ?? []).map((o) => ({
    id: o.id,
    label:
      o.kind === 'company'
        ? o.company_name ?? '—'
        : `${o.first_name ?? ''} ${o.last_name ?? ''}`.trim() || '—',
  }));
  const woOpts = (workOrders ?? []).map((w) => ({ id: w.id, label: `${w.code} · ${w.title}` }));
  const offerOpts = (offers ?? []).map((o) => ({ id: o.id, label: `${o.code} · ${o.title}` }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Rechnung bearbeiten" description="Nur Entwürfe können bearbeitet werden." />
      <BillingDocumentForm
        action={updateInvoiceAction}
        cancelHref={`/billing/invoices/${invoice.id}`}
        submitLabel="Speichern"
        kind="invoice"
        properties={properties ?? []}
        owners={ownerOpts}
        workOrders={woOpts}
        offers={offerOpts}
        initial={{
          id: invoice.id,
          title: invoice.title,
          description: invoice.description,
          property_id: invoice.property_id,
          owner_id: invoice.owner_id,
          work_order_id: invoice.work_order_id,
          offer_id: invoice.offer_id,
          bill_to_name: invoice.bill_to_name,
          bill_to_address: invoice.bill_to_address,
          issued_at: invoice.issued_at,
          due_at: invoice.due_at,
          notes: invoice.notes,
        }}
      />
    </div>
  );
}
