import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/platform/require-admin';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { formatDate, formatEUR } from '@/lib/format';
import { StatusBadge } from '@/components/platform/status-badge';
import { createPlatformServiceClient } from '@/lib/supabase/platform';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { getPlatformStats } from '@/lib/platform/stats';

export const dynamic = 'force-dynamic';

export default async function PlatformTenantsPage() {
  await requirePlatformAdmin();
  const service = createSupabaseServiceClient();

  // Sprint 137: Die Kennzahlen standen bis hierher auf dem Dashboard und
  // haben es besetzt gehalten. Sie gehoeren zum Kundenbestand, nicht zur
  // Warteschlange — sie beantworten "wie steht das Geschaeft da", nicht
  // "wer wartet gerade auf mich".
  const stats = await getPlatformStats();

  // Sprint 116: "Noch keine Agenturen angemeldet." ist der Leerzustand
  // dieser Tabelle — und war bei einem Query-Fehler nicht davon zu
  // unterscheiden, dass die Kundenliste des Betreibers gerade nicht
  // ladbar ist. Fuer den einzigen Menschen, der diese Seite sieht, ist
  // das die Aussage "wir haben keine Kunden".
  const [tenantsResult, plansResult] = await Promise.all([
    service
      .from('tenants')
      .select('id, name, slug, status, subscription_status, subscription_plan_id, subscription_interval, trial_ends_at, current_period_end, created_at')
      .order('created_at', { ascending: false }),
    createPlatformServiceClient().from('subscription_plans').select('id, name'),
  ]);

  const tenants = unwrapRows(tenantsResult, 'Plattform: Agenturen');
  const plans = unwrapRows(plansResult, 'Plattform: Tarife');

  const planName = new Map(plans.map((p) => [p.id, p.name]));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Agenturen</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Alle Hausmeister-Agenturen (Tenants), die auf der Plattform angemeldet sind.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 shadow-sm sm:col-span-2">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Monatlicher Umsatz (MRR)
          </div>
          <div className="mt-1 text-3xl font-semibold tracking-tight">
            {formatEUR(stats.mrrCents)}
          </div>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Jahresabos werden auf den Monat umgerechnet (÷12). Mandanten in der Testphase zählen nicht.
          </p>
        </div>
        <StatTile label="Agenturen gesamt" value={stats.tenants.total} />
        <StatTile label="Aktive Abos" value={stats.tenants.active} />
        <StatTile label="In Testphase" value={stats.tenants.trial} />
        <StatTile label="Trial läuft ≤ 7 Tage" value={stats.trialEndingSoon} />
        <StatTile label="Zahlungsrückstand" value={stats.tenants.past_due} />
        <StatTile label="Suspendiert" value={stats.tenants.suspended} />
      </section>

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Trial / Bis</th>
              <th className="px-4 py-3 font-medium">Angelegt</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {tenants.map((t) => {
              const bindingDate =
                t.subscription_status === 'trial'
                  ? t.trial_ends_at
                  : t.current_period_end;
              return (
                <tr key={t.id} className="hover:bg-[var(--color-muted)]/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/platform/tenants/${t.id}`}
                      className="font-medium hover:underline"
                    >
                      {t.name}
                    </Link>
                    <div className="text-xs text-[var(--color-muted-foreground)]">/{t.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.subscription_status} />
                  </td>
                  <td className="px-4 py-3">
                    {t.subscription_plan_id ? (
                      <span>
                        {planName.get(t.subscription_plan_id) ?? '—'}
                        {t.subscription_interval && (
                          <span className="ml-1 text-xs text-[var(--color-muted-foreground)]">
                            ({t.subscription_interval === 'yearly' ? 'jährlich' : 'monatlich'})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[var(--color-muted-foreground)]">kein Plan</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                    {formatDate(bindingDate)}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                    {formatDate(t.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/platform/tenants/${t.id}`}
                      className="text-sm text-[var(--color-brand)] hover:underline"
                    >
                      Öffnen →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {tenants.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--color-muted-foreground)]">
                  Noch keine Agenturen angemeldet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}
