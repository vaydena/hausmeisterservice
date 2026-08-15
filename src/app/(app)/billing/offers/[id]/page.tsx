import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows, unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCents, formatDate, OFFER_STATUS_LABEL, OFFER_STATUS_TONE, type OfferStatus } from '@/lib/schemas/billing';
import { LineItemsEditor } from '../../line-items';
import { DeleteDraftDocumentButton, OfferStatusButtons } from '../../status-actions';
import { SendBillingEmailButton } from '../../send-email-dialog';

export const metadata: Metadata = { title: 'Angebot' };

export default async function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  // Sprint 107: siehe Rechnungs-Detailseite — ein Query-Fehler sah hier aus
  // wie ein geloeschtes Angebot bzw. wie ein Angebot ohne Positionen unter
  // voller Summe.
  const offer = unwrapMaybeRow(
    await supabase
      .from('offers')
      .select(
        'id, code, title, description, status, bill_to_name, bill_to_address, property_id, owner_id, issued_at, valid_until, notes, net_total_cents, tax_total_cents, gross_total_cents, created_by, created_at',
      )
      .eq('id', id)
      .maybeSingle(),
    'Angebot',
  );
  if (!offer) notFound();

  const items = unwrapRows(
    await supabase
      .from('billing_line_items')
      .select('id, position, description, quantity, unit, unit_price_cents, tax_rate, net_cents, tax_cents, gross_cents')
      .eq('offer_id', offer.id)
      .order('position'),
    'Angebot: Positionen',
  );

  const property = offer.property_id
    ? unwrapMaybeRow(
        await supabase.from('properties').select('id, name').eq('id', offer.property_id).maybeSingle(),
        'Angebot: Objekt',
      )
    : null;
  const owner = offer.owner_id
    ? unwrapMaybeRow(
        await supabase
          .from('owners')
          .select('kind, first_name, last_name, company_name, email')
          .eq('id', offer.owner_id)
          .maybeSingle(),
        'Angebot: Eigentümer',
      )
    : null;

  const status = offer.status as OfferStatus;
  const canEdit = permissions.has('billing.edit');
  const isDraft = status === 'draft';
  const canDelete = canEdit && isDraft;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={`${offer.code} — ${offer.title}`}
        description={`Empfänger: ${offer.bill_to_name}`}
        action={
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/offers/${offer.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
            >
              PDF öffnen
            </a>
            {canEdit && (
              <SendBillingEmailButton
                kind="offer"
                id={offer.id}
                code={offer.code}
                title={offer.title}
                defaultTo={owner?.email ?? undefined}
              />
            )}
            {canEdit && isDraft && (
              <Link
                href={`/billing/offers/${offer.id}/edit`}
                className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
              >
                Bearbeiten
              </Link>
            )}
            {canEdit && <OfferStatusButtons id={offer.id} current={status} />}
            {canDelete && <DeleteDraftDocumentButton id={offer.id} kind="offer" />}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>Positionen</span>
                <Badge tone={OFFER_STATUS_TONE[status]}>{OFFER_STATUS_LABEL[status]}</Badge>
              </CardTitle>
            </CardHeader>
            <CardBody>
              <LineItemsEditor kind="offer" parentId={offer.id} items={items} editable={canEdit && isDraft} />
              <dl className="mt-4 grid gap-1 border-t border-[var(--color-border)] pt-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-[var(--color-muted-foreground)]">Netto</dt>
                  <dd className="tabular-nums">{formatCents(offer.net_total_cents)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[var(--color-muted-foreground)]">MwSt</dt>
                  <dd className="tabular-nums">{formatCents(offer.tax_total_cents)}</dd>
                </div>
                <div className="flex items-center justify-between text-base font-semibold">
                  <dt>Brutto</dt>
                  <dd className="tabular-nums">{formatCents(offer.gross_total_cents)}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {offer.description && (
            <Card>
              <CardHeader>
                <CardTitle>Beschreibung</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm">{offer.description}</p>
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
                <Row label="Rechnungsdatum" value={formatDate(offer.issued_at)} />
                <Row label="Gültig bis" value={formatDate(offer.valid_until)} />
              </dl>
            </CardBody>
          </Card>

          {offer.bill_to_address && (
            <Card>
              <CardHeader>
                <CardTitle>Adresse</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm">
                  {offer.bill_to_name}
                  {'\n'}
                  {offer.bill_to_address}
                </p>
              </CardBody>
            </Card>
          )}

          {offer.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notizen (intern)</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm text-[var(--color-muted-foreground)]">{offer.notes}</p>
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
