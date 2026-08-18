import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOwnerContext } from '@/lib/owner-portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  formatCents,
  formatDate as formatBillingDate,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
  isOverdue,
} from '@/lib/schemas/billing';

export const metadata: Metadata = { title: 'Rechnungen · Eigentümer-Portal' };

export default async function OwnerRechnungenPage() {
  const ctx = await getOwnerContext();
  if (!ctx) redirect('/owner/login');

  const supabase = await createSupabaseServerClient();
  const invoices = unwrapRows(
    await supabase
      .from('invoices')
      .select('id, code, title, status, gross_total_cents, issued_at, due_at')
      .order('issued_at', { ascending: false }),
    'Eigentümerportal: Rechnungen',
  );

  const openTotal = invoices
    .filter((i) => i.status === 'sent')
    .reduce((sum, i) => sum + (i.gross_total_cents ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rechnungen"
        description="Rechnungen zu Ihren Objekten — als PDF herunterladbar."
      />

      {invoices.length === 0 ? (
        <EmptyState
          title="Keine Rechnungen"
          description="Hier erscheinen Rechnungen, die auf Sie oder Ihre Objekte ausgestellt sind."
        />
      ) : (
        <>
          <div className="flex items-baseline justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
            <span className="text-sm text-[var(--color-muted-foreground)]">Offener Betrag</span>
            <span className="text-xl font-semibold tabular-nums">{formatCents(openTotal)}</span>
          </div>

          <Card>
            <ul className="divide-y divide-[var(--color-border)]">
              {invoices.map((i) => {
                const overdue = isOverdue(i.due_at, i.status);
                return (
                  <li
                    key={i.id}
                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="muted">{i.code}</Badge>
                        <span className="truncate font-medium">{i.title}</span>
                      </div>
                      <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                        Ausgestellt {formatBillingDate(i.issued_at)}
                        {i.due_at ? ` · fällig ${formatBillingDate(i.due_at)}` : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums font-medium">
                        {formatCents(i.gross_total_cents)}
                      </span>
                      {overdue && <Badge tone="danger">Überfällig</Badge>}
                      <Badge tone={INVOICE_STATUS_TONE[i.status] ?? 'neutral'}>
                        {INVOICE_STATUS_LABEL[i.status] ?? i.status}
                      </Badge>
                      <a
                        href={`/api/owner/invoices/${i.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 shrink-0 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
                      >
                        PDF
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
