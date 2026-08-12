import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/current';
import { evaluateSubscriptionAccess } from '@/lib/tenant/subscription-guard';

export const dynamic = 'force-dynamic';

const REASON_LABELS: Record<string, string> = {
  trial_expired: 'Deine 14-tägige Testphase ist abgelaufen.',
  past_due:      'Wir haben noch keinen Zahlungseingang für die aktuelle Rechnung erhalten.',
  suspended:     'Dein Zugang wurde vom Betreiber pausiert.',
  canceled:      'Dein Abo wurde gekündigt und ist ausgelaufen.',
};

export default async function PaymentRequiredPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const access = await evaluateSubscriptionAccess(ctx.tenantId);
  if (access.access !== 'blocked') redirect('/dashboard');

  const reason = REASON_LABELS[access.reason] ?? 'Aktion erforderlich, um den Zugang wiederherzustellen.';

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-amber-900">Zugang aktuell gesperrt</h1>
        <p className="mt-2 text-sm text-amber-800">{reason}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {ctx.isOwner ? (
            <Link
              href="/settings/subscription"
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
            >
              Zur Abo-Verwaltung
            </Link>
          ) : (
            <p className="text-sm text-amber-800">
              Bitte den Inhaber deiner Agentur ({ctx.email}) kontaktieren, um die Zahlung zu regeln.
            </p>
          )}
          <Link
            href="/logout"
            className="rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-sm hover:bg-[var(--color-muted)]"
          >
            Abmelden
          </Link>
        </div>
      </div>
    </main>
  );
}
