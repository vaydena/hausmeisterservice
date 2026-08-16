import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/platform/require-admin';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { formatDate, formatEUR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { confirmBankTransferAction } from './actions';
import { createPlatformServiceClient } from '@/lib/supabase/platform';
import { unwrapRows } from '@/lib/supabase/unwrap';

export const dynamic = 'force-dynamic';

export default async function PlatformPaymentsPage() {
  await requirePlatformAdmin();
  const service = createSupabaseServiceClient();

  // Sprint 116: Die teuerste Verwechslung im Betreiber-Bereich. "Keine
  // offenen Zahlungen." ist hier eine Handlungsanweisung — der Betreiber
  // schliesst daraus, dass nichts zu bestaetigen ist. Bei einem
  // verschluckten Query-Fehler stand derselbe Satz da, waehrend Rechnungen
  // offen und faellig waren: der Zahlungseingang wird nie bestaetigt, der
  // Mandant laeuft in 'past_due' und wird ausgesperrt, obwohl er bezahlt hat.
  const openInvoices = unwrapRows(
    await createPlatformServiceClient()
      .from('invoices')
      .select('id, invoice_number, tenant_id, total_cents, issued_at, due_at, period_start, period_end, payment_method')
      .is('paid_at', null)
      .eq('status', 'open')
      .eq('payment_method', 'bank_transfer')
      .order('issued_at', { ascending: true }),
    'Plattform: offene Ueberweisungen',
  );

  const tenantIds = Array.from(new Set(openInvoices.map((i) => i.tenant_id)));
  const tenantsMap = new Map<string, { name: string; slug: string }>();
  if (tenantIds.length > 0) {
    const tenants = unwrapRows(
      await service.from('tenants').select('id, name, slug').in('id', tenantIds),
      'Plattform: Agenturen zu offenen Rechnungen',
    );
    for (const t of tenants) tenantsMap.set(t.id, { name: t.name, slug: t.slug });
  }

  const totalOpen = openInvoices.reduce((sum, i) => sum + (i.total_cents ?? 0), 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Offene Überweisungen</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Rechnungen, die per Überweisung angefordert wurden und auf Zahlungsbestätigung warten.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Offene Rechnungen
          </div>
          <div className="mt-2 text-2xl font-semibold">{openInvoices.length}</div>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Summe
          </div>
          <div className="mt-2 text-2xl font-semibold">{formatEUR(totalOpen)}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">Rechnung</th>
              <th className="px-4 py-3 font-medium">Agentur</th>
              <th className="px-4 py-3 font-medium">Zeitraum</th>
              <th className="px-4 py-3 font-medium">Betrag</th>
              <th className="px-4 py-3 font-medium">Fällig</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {openInvoices.map((inv) => {
              const tenant = tenantsMap.get(inv.tenant_id);
              return (
                <tr key={inv.id} className="hover:bg-[var(--color-muted)]/40">
                  <td className="px-4 py-3">
                    <a
                      href={`/api/platform/invoices/${inv.id}/pdf`}
                      className="font-mono text-xs text-[var(--color-brand)] hover:underline"
                    >
                      {inv.invoice_number}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    {tenant ? (
                      <Link
                        href={`/platform/tenants/${inv.tenant_id}`}
                        className="hover:underline"
                      >
                        {tenant.name}
                      </Link>
                    ) : (
                      <span className="text-[var(--color-muted-foreground)]">?</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                    {formatDate(inv.period_start)} – {formatDate(inv.period_end)}
                  </td>
                  <td className="px-4 py-3 font-medium">{formatEUR(inv.total_cents)}</td>
                  <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                    {formatDate(inv.due_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={confirmBankTransferAction} className="flex flex-wrap justify-end gap-1">
                      <input type="hidden" name="invoiceId" value={inv.id} />
                      <input
                        type="text"
                        name="paymentReference"
                        placeholder="Bankreferenz (opt.)"
                        className="w-40 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs"
                      />
                      <Button variant="primary" size="sm" type="submit">
                        Zahlungseingang bestätigen
                      </Button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {openInvoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--color-muted-foreground)]">
                  Keine offenen Zahlungen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
