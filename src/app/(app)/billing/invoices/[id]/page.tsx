import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows, unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { parseTenantAddress, parseTenantInvoiceData } from '@/lib/schemas/tenant';
import { findInvoiceDefects, INVOICE_DEFECT_LABEL } from '@/lib/billing/invoice-integrity';
import { ModuleLink } from '@/components/ui/module-link';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  formatCents,
  formatDate,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
  isOverdue,
  type InvoiceStatus,
} from '@/lib/schemas/billing';
import { LineItemsEditor } from '../../line-items';
import { DeleteDraftDocumentButton, InvoiceStatusButtons } from '../../status-actions';
import { SendBillingEmailButton } from '../../send-email-dialog';

export const metadata: Metadata = { title: 'Rechnung' };

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  // Sprint 107: Alle Queries dieser Seite laufen ueber unwrap*. Vorher wurde
  // ein Fehler bei `invoice` zu notFound() (die Rechnung wirkte geloescht)
  // und ein Fehler bei `items` zu einer Rechnung ohne Positionen, unter der
  // trotzdem die volle Summe stand.
  const invoice = unwrapMaybeRow(
    await supabase
      .from('invoices')
      .select(
        'id, code, title, description, status, bill_to_name, bill_to_address, property_id, owner_id, work_order_id, offer_id, issued_at, due_at, paid_at, notes, net_total_cents, tax_total_cents, gross_total_cents',
      )
      .eq('id', id)
      .maybeSingle(),
    'Rechnung',
  );
  if (!invoice) notFound();

  const items = unwrapRows(
    await supabase
      .from('billing_line_items')
      .select('id, position, description, quantity, unit, unit_price_cents, tax_rate, net_cents, tax_cents, gross_cents')
      .eq('invoice_id', invoice.id)
      .order('position'),
    'Rechnung: Positionen',
  );

  const property = invoice.property_id
    ? unwrapMaybeRow(
        await supabase.from('properties').select('id, name').eq('id', invoice.property_id).maybeSingle(),
        'Rechnung: Objekt',
      )
    : null;
  const owner = invoice.owner_id
    ? unwrapMaybeRow(
        await supabase
          .from('owners')
          .select('kind, first_name, last_name, company_name, email')
          .eq('id', invoice.owner_id)
          .maybeSingle(),
        'Rechnung: Eigentümer',
      )
    : null;
  const workOrder = invoice.work_order_id
    ? unwrapMaybeRow(
        await supabase.from('work_orders').select('id, code, title').eq('id', invoice.work_order_id).maybeSingle(),
        'Rechnung: verknüpfter Auftrag',
      )
    : null;
  const offer = invoice.offer_id
    ? unwrapMaybeRow(
        await supabase.from('offers').select('id, code, title').eq('id', invoice.offer_id).maybeSingle(),
        'Rechnung: Basis-Angebot',
      )
    : null;

  const tenant = unwrapMaybeRow(
    await supabase.from('tenants').select('name, address, invoice_data').eq('id', ctx.tenantId).maybeSingle(),
    'Rechnung: Absenderdaten des Mandanten',
  );
  const tenantInvoiceData = parseTenantInvoiceData(tenant?.invoice_data);
  const defects = findInvoiceDefects({
    issuedAt: invoice.issued_at,
    netTotalCents: invoice.net_total_cents,
    taxTotalCents: invoice.tax_total_cents,
    grossTotalCents: invoice.gross_total_cents,
    lines: items,
    sender: {
      name: tenant?.name ?? null,
      legalName: tenantInvoiceData.legal_name,
      address: parseTenantAddress(tenant?.address),
      taxId: tenantInvoiceData.tax_id,
      vatId: tenantInvoiceData.vat_id,
    },
  });
  const defectMessages = defects.map((d) => INVOICE_DEFECT_LABEL[d]);

  const status = invoice.status as InvoiceStatus;
  const canEdit = permissions.has('billing.edit');
  const isDraft = status === 'draft';
  const canDelete = canEdit && isDraft;
  const overdue = isOverdue(invoice.due_at, status);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={`${invoice.code} — ${invoice.title}`}
        description={`Empfänger: ${invoice.bill_to_name}`}
        action={
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
            >
              PDF öffnen
            </a>
            {canEdit && (
              <SendBillingEmailButton
                kind="invoice"
                id={invoice.id}
                code={invoice.code}
                title={invoice.title}
                defaultTo={owner?.email ?? undefined}
                defects={defectMessages}
              />
            )}
            {canEdit && isDraft && (
              <Link
                href={`/billing/invoices/${invoice.id}/edit`}
                className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
              >
                Bearbeiten
              </Link>
            )}
            {canEdit && <InvoiceStatusButtons id={invoice.id} current={status} />}
            {canDelete && <DeleteDraftDocumentButton id={invoice.id} kind="invoice" />}
          </div>
        }
      />

      {defectMessages.length > 0 && (
        <div
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
          role="status"
        >
          <p className="font-semibold">Diese Rechnung ist noch nicht versandfertig</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {defectMessages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="mt-2 text-[var(--color-muted-foreground)]">
            Absenderangaben stehen unter{' '}
            <Link href="/settings/tenant" className="underline hover:text-[var(--color-primary)]">
              Einstellungen → Mandant
            </Link>
            . Sie gelten danach für alle Rechnungen.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>Positionen</span>
                <Badge tone={INVOICE_STATUS_TONE[status]}>{INVOICE_STATUS_LABEL[status]}</Badge>
                {overdue && <Badge tone="danger">überfällig</Badge>}
              </CardTitle>
            </CardHeader>
            <CardBody>
              <LineItemsEditor kind="invoice" parentId={invoice.id} items={items} editable={canEdit && isDraft} />
              <dl className="mt-4 grid gap-1 border-t border-[var(--color-border)] pt-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-[var(--color-muted-foreground)]">Netto</dt>
                  <dd className="tabular-nums">{formatCents(invoice.net_total_cents)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[var(--color-muted-foreground)]">MwSt</dt>
                  <dd className="tabular-nums">{formatCents(invoice.tax_total_cents)}</dd>
                </div>
                <div className="flex items-center justify-between text-base font-semibold">
                  <dt>Brutto</dt>
                  <dd className="tabular-nums">{formatCents(invoice.gross_total_cents)}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {invoice.description && (
            <Card>
              <CardHeader>
                <CardTitle>Beschreibung</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm">{invoice.description}</p>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Übersicht</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="space-y-3 text-sm">
                <Row label="Objekt" value={property?.name ?? '—'} />
                <Row
                  label="Eigentümer"
                  value={
                    owner
                      ? owner.kind === 'company'
                        ? owner.company_name ?? '—'
                        : `${owner.first_name ?? ''} ${owner.last_name ?? ''}`.trim() || '—'
                      : '—'
                  }
                />
                <Row label="Rechnungsdatum" value={formatDate(invoice.issued_at)} />
                <Row label="Fällig am" value={formatDate(invoice.due_at)} />
                <Row label="Bezahlt am" value={formatDate(invoice.paid_at)} />
                {workOrder && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">Auftrag</dt>
                    <dd>
                      <ModuleLink
                        href={`/work-orders/${workOrder.id}`}
                        className="hover:text-[var(--color-primary)]"
                      >
                        {workOrder.code} · {workOrder.title}
                      </ModuleLink>
                    </dd>
                  </div>
                )}
                {offer && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">Basis-Angebot</dt>
                    <dd>
                      <Link href={`/billing/offers/${offer.id}`} className="hover:text-[var(--color-primary)]">
                        {offer.code} · {offer.title}
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>

          {invoice.bill_to_address && (
            <Card>
              <CardHeader>
                <CardTitle>Adresse</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm">
                  {invoice.bill_to_name}
                  {'\n'}
                  {invoice.bill_to_address}
                </p>
              </CardBody>
            </Card>
          )}

          {invoice.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notizen (intern)</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm text-[var(--color-muted-foreground)]">{invoice.notes}</p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
