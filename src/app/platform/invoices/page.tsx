import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/platform/require-admin';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createPlatformServiceClient } from '@/lib/supabase/platform';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { formatDate, formatEUR } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  open: 'offen',
  paid: 'bezahlt',
  canceled: 'storniert',
  refunded: 'erstattet',
};

const STATUS_STYLES: Record<string, string> = {
  open: 'text-amber-700',
  paid: 'text-emerald-700',
  canceled: 'text-neutral-500',
  refunded: 'text-neutral-500',
};

/**
 * Sprint 137 · Die Rechnungen des Betreibers.
 *
 * Der Menuepunkt "Rechnungen" stand seit Sprint 10 in der Sidebar und fuehrte
 * ins 404. Das faellt jetzt zusammen mit der Freischaltung an: jede
 * Freischaltung schreibt eine bezahlte Rechnung als Beleg, und ein Beleg,
 * den man nirgends nachschlagen kann, ist keiner.
 *
 * Zeigt bewusst ALLE Rechnungen, nicht nur die offenen — dafuer gibt es
 * /platform/payments. Hier steht die Historie: was wurde wem berechnet,
 * wann kam das Geld, unter welcher Bankreferenz.
 */
export default async function PlatformInvoicesPage() {
  await requirePlatformAdmin();
  const service = createSupabaseServiceClient();

  // Sprint 116er Regel: "Noch keine Rechnungen." ist die Aussage, dass dem
  // Betreiber nie Geld zugeflossen ist. Ein verschluckter Query-Fehler
  // wuerde hier also seine gesamte Buchhaltung wegzaubern.
  const invoices = unwrapRows(
    await createPlatformServiceClient()
      .from('invoices')
      .select(
        'id, invoice_number, tenant_id, plan_interval, total_cents, status, issued_at, paid_at, due_at, period_start, period_end, payment_reference',
      )
      .order('issued_at', { ascending: false })
      .limit(200),
    'Plattform: Rechnungen',
  );

  const tenantIds = Array.from(new Set(invoices.map((i) => i.tenant_id)));
  const tenantsMap = new Map<string, string>();
  if (tenantIds.length > 0) {
    const tenants = unwrapRows(
      await service.from('tenants').select('id, name').in('id', tenantIds),
      'Plattform: Agenturen zu Rechnungen',
    );
    for (const t of tenants) tenantsMap.set(t.id, t.name);
  }

  const paidTotal = invoices
    .filter((i) => i.paid_at !== null)
    .reduce((sum, i) => sum + (i.total_cents ?? 0), 0);
  const openTotal = invoices
    .filter((i) => i.paid_at === null && i.status === 'open')
    .reduce((sum, i) => sum + (i.total_cents ?? 0), 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Rechnungen</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Alle Plattform-Rechnungen an die Agenturen — die neuesten 200. Belege aus
          Freischaltungen erscheinen hier direkt als bezahlt.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Tile label="Rechnungen" value={String(invoices.length)} />
        <Tile label="Davon bezahlt" value={formatEUR(paidTotal)} />
        <Tile label="Noch offen" value={formatEUR(openTotal)} />
      </section>

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">Nummer</th>
              <th className="px-4 py-3 font-medium">Agentur</th>
              <th className="px-4 py-3 font-medium">Zeitraum</th>
              <th className="px-4 py-3 font-medium">Betrag</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Bezahlt am</th>
              <th className="px-4 py-3 font-medium">Referenz</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {invoices.map((inv) => (
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
                  <Link href={`/platform/tenants/${inv.tenant_id}`} className="hover:underline">
                    {tenantsMap.get(inv.tenant_id) ?? '—'}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                  {formatDate(inv.period_start)} – {formatDate(inv.period_end)}
                  <span className="ml-1 text-xs">
                    ({inv.plan_interval === 'yearly' ? 'jährlich' : 'monatlich'})
                  </span>
                </td>
                <td className="px-4 py-3 font-medium">{formatEUR(inv.total_cents)}</td>
                <td className={`px-4 py-3 ${STATUS_STYLES[inv.status] ?? ''}`}>
                  {STATUS_LABELS[inv.status] ?? inv.status}
                </td>
                <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                  {inv.paid_at ? formatDate(inv.paid_at) : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                  {inv.payment_reference ?? '—'}
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--color-muted-foreground)]">
                  Noch keine Rechnungen gestellt.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}
