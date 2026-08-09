import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { formatCents, formatDate, OFFER_STATUS_LABEL, OFFER_STATUS_TONE, type OfferStatus } from '@/lib/schemas/billing';

export const metadata: Metadata = { title: 'Angebote' };

export default async function OffersPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('billing.view')) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: offers } = await supabase
    .from('offers')
    .select('id, code, title, status, bill_to_name, issued_at, valid_until, gross_total_cents')
    .order('created_at', { ascending: false });

  const rows = offers ?? [];
  const canCreate = permissions.has('billing.create');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Angebote"
        description={`${rows.length} Angebot${rows.length === 1 ? '' : 'e'}`}
        action={canCreate ? <LinkButton href="/billing/offers/new">Neues Angebot</LinkButton> : undefined}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Noch keine Angebote"
          description="Legen Sie ein Angebot an, um Positionen zu erfassen und zu versenden."
          action={canCreate ? <LinkButton href="/billing/offers/new">Neues Angebot</LinkButton> : undefined}
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-[var(--color-border)] text-xs uppercase text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="p-3">Nr.</th>
                  <th className="p-3">Titel</th>
                  <th className="p-3">Empfänger</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Datum</th>
                  <th className="p-3">Gültig bis</th>
                  <th className="p-3 text-right">Betrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td className="p-3 font-mono text-xs">
                      <Link href={`/billing/offers/${o.id}`} className="hover:text-[var(--color-primary)]">
                        {o.code}
                      </Link>
                    </td>
                    <td className="p-3">
                      <Link href={`/billing/offers/${o.id}`} className="hover:text-[var(--color-primary)]">
                        {o.title}
                      </Link>
                    </td>
                    <td className="p-3 text-xs">{o.bill_to_name}</td>
                    <td className="p-3">
                      <Badge tone={OFFER_STATUS_TONE[o.status as OfferStatus]}>
                        {OFFER_STATUS_LABEL[o.status as OfferStatus]}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs">{formatDate(o.issued_at)}</td>
                    <td className="p-3 text-xs">{formatDate(o.valid_until)}</td>
                    <td className="p-3 text-right tabular-nums font-medium">{formatCents(o.gross_total_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
