import { getPlatformStats } from '@/lib/platform/stats';
import { formatEUR } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PlatformDashboardPage() {
  const stats = await getPlatformStats();

  const tiles = [
    { label: 'Agenturen gesamt',     value: stats.tenants.total },
    { label: 'Aktive Abos',          value: stats.tenants.active },
    { label: 'In Testphase',         value: stats.tenants.trial },
    { label: 'Trial läuft ≤ 7 Tage', value: stats.trialEndingSoon },
    { label: 'Zahlungs­rückstand',   value: stats.tenants.past_due },
    { label: 'Suspendiert',          value: stats.tenants.suspended },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Plattform-Dashboard</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Übersicht über alle Agenturen, laufende Abos und offene Zahlungen.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="col-span-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Monatlicher Umsatz (MRR)
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">
            {formatEUR(stats.mrrCents)}
          </div>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Jahresabos werden auf den Monat umgerechnet (÷12). Trial-Tenants zählen nicht.
          </p>
        </div>
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 shadow-sm"
          >
            <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
              {tile.label}
            </div>
            <div className="mt-2 text-2xl font-semibold">{tile.value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Offene Zahlungen
          </h2>
          <a
            href="/platform/payments"
            className="text-sm text-[var(--color-brand)] hover:underline"
          >
            Alle anzeigen
          </a>
        </div>
        <div className="mt-3 flex items-baseline gap-6">
          <div>
            <div className="text-3xl font-semibold">{stats.openInvoices.count}</div>
            <div className="text-xs text-[var(--color-muted-foreground)]">offene Rechnungen</div>
          </div>
          <div>
            <div className="text-2xl font-medium text-[var(--color-muted-foreground)]">
              {formatEUR(stats.openInvoices.totalCents)}
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)]">Summe</div>
          </div>
        </div>
      </section>
    </div>
  );
}
