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
import { formatCents, formatDate, INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, isOverdue, type InvoiceStatus } from '@/lib/schemas/billing';

export const metadata: Metadata = { title: 'Rechnungen' };

export default async function InvoicesPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('billing.view')) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, code, title, status, bill_to_name, issued_at, due_at, paid_at, gross_total_cents')
    .order('created_at', { ascending: false });

  const rows = invoices ?? [];
  const canCreate = permissions.has('billing.create');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Rechnungen"
        description={`${rows.length} Rechnung${rows.length === 1 ? '' : 'en'}`}
        action={canCreate ? <LinkButton href="/billing/invoices/new">Neue Rechnung</LinkButton> : undefined}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Noch keine Rechnungen"
          description="Legen Sie eine Rechnung an, um Positionen zu erfassen und zu versenden."
          action={canCreate ? <LinkButton href="/billing/invoices/new">Neue Rechnung</LinkButton> : undefined}
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
                  <th className="p-3">Fällig</th>
                  <th className="p-3 text-right">Betrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map((i) => {
                  const st = i.status as InvoiceStatus;
                  const overdue = isOverdue(i.due_at, st);
                  return (
                    <tr key={i.id}>
                      <td className="p-3 font-mono text-xs">
                        <Link href={`/billing/invoices/${i.id}`} className="hover:text-[var(--color-primary)]">
                          {i.code}
                        </Link>
                      </td>
                      <td className="p-3">
                        <Link href={`/billing/invoices/${i.id}`} className="hover:text-[var(--color-primary)]">
                          {i.title}
                        </Link>
                      </td>
                      <td className="p-3 text-xs">{i.bill_to_name}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Badge tone={INVOICE_STATUS_TONE[st]}>{INVOICE_STATUS_LABEL[st]}</Badge>
                          {overdue && <Badge tone="danger">überfällig</Badge>}
                        </div>
                      </td>
                      <td className="p-3 text-xs">{formatDate(i.issued_at)}</td>
                      <td className="p-3 text-xs">{formatDate(i.due_at)}</td>
                      <td className="p-3 text-right tabular-nums font-medium">{formatCents(i.gross_total_cents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
