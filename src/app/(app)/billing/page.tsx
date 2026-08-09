import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCents, formatDate, isOverdue } from '@/lib/schemas/billing';

export const metadata: Metadata = { title: 'Abrechnung' };

export default async function BillingPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('billing.view')) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: invoices }, { data: offers }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, code, title, status, gross_total_cents, due_at, paid_at, issued_at')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('offers')
      .select('id, code, title, status, gross_total_cents, issued_at, valid_until')
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const invs = invoices ?? [];
  const offs = offers ?? [];

  const openInvoices = invs.filter((i) => i.status === 'sent' || i.status === 'draft');
  const overdueInvoices = invs.filter((i) => isOverdue(i.due_at, i.status));
  const paidThisYear = invs.filter((i) => {
    if (i.status !== 'paid' || !i.paid_at) return false;
    return i.paid_at.startsWith(String(new Date().getUTCFullYear()));
  });
  const openOffers = offs.filter((o) => o.status === 'sent' || o.status === 'draft');

  const openSum = openInvoices.reduce((s, i) => s + (i.gross_total_cents ?? 0), 0);
  const overdueSum = overdueInvoices.reduce((s, i) => s + (i.gross_total_cents ?? 0), 0);
  const paidSum = paidThisYear.reduce((s, i) => s + (i.gross_total_cents ?? 0), 0);
  const openOffersSum = openOffers.reduce((s, o) => s + (o.gross_total_cents ?? 0), 0);

  const canCreate = permissions.has('billing.create');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Abrechnung"
        description="Angebote und Rechnungen — Umsatzübersicht."
        action={
          canCreate ? (
            <div className="flex gap-2">
              <LinkButton href="/billing/offers/new">Neues Angebot</LinkButton>
              <LinkButton href="/billing/invoices/new">Neue Rechnung</LinkButton>
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Offene Rechnungen" value={formatCents(openSum)} sub={`${openInvoices.length} Belege`} />
        <Kpi
          title="Überfällig"
          value={formatCents(overdueSum)}
          sub={`${overdueInvoices.length} Belege`}
          accent={overdueInvoices.length > 0 ? 'danger' : 'muted'}
        />
        <Kpi title="Umsatz YTD (bezahlt)" value={formatCents(paidSum)} sub={`${paidThisYear.length} Belege`} accent="success" />
        <Kpi title="Offene Angebote" value={formatCents(openOffersSum)} sub={`${openOffers.length} Angebote`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              Rechnungen{' '}
              <Link href="/billing/invoices" className="text-xs font-normal text-[var(--color-primary)] hover:underline">
                → alle
              </Link>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-[var(--color-border)]">
              {invs.slice(0, 8).map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/billing/invoices/${i.id}`}
                    className="flex items-center justify-between gap-4 py-2 text-sm hover:bg-[var(--color-muted)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[var(--color-muted-foreground)]">{i.code}</span>
                        <span className="truncate">{i.title}</span>
                      </div>
                      <div className="text-xs text-[var(--color-muted-foreground)]">
                        {i.status} · fällig {formatDate(i.due_at)}
                      </div>
                    </div>
                    <span className="tabular-nums font-medium">{formatCents(i.gross_total_cents)}</span>
                  </Link>
                </li>
              ))}
              {invs.length === 0 && (
                <li className="py-4 text-sm text-[var(--color-muted-foreground)]">Noch keine Rechnungen.</li>
              )}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Angebote{' '}
              <Link href="/billing/offers" className="text-xs font-normal text-[var(--color-primary)] hover:underline">
                → alle
              </Link>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-[var(--color-border)]">
              {offs.slice(0, 8).map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/billing/offers/${o.id}`}
                    className="flex items-center justify-between gap-4 py-2 text-sm hover:bg-[var(--color-muted)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[var(--color-muted-foreground)]">{o.code}</span>
                        <span className="truncate">{o.title}</span>
                      </div>
                      <div className="text-xs text-[var(--color-muted-foreground)]">
                        {o.status} · gültig bis {formatDate(o.valid_until)}
                      </div>
                    </div>
                    <span className="tabular-nums font-medium">{formatCents(o.gross_total_cents)}</span>
                  </Link>
                </li>
              ))}
              {offs.length === 0 && (
                <li className="py-4 text-sm text-[var(--color-muted-foreground)]">Noch keine Angebote.</li>
              )}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  title,
  value,
  sub,
  accent = 'muted',
}: {
  title: string;
  value: string;
  sub?: string;
  accent?: 'muted' | 'success' | 'danger';
}) {
  const accentClass =
    accent === 'success'
      ? 'text-[var(--color-success)]'
      : accent === 'danger'
      ? 'text-[var(--color-destructive)]'
      : 'text-[var(--color-foreground)]';
  return (
    <Card>
      <CardBody>
        <p className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">{title}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${accentClass}`}>{value}</p>
        {sub && <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{sub}</p>}
      </CardBody>
    </Card>
  );
}
