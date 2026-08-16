import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/platform/require-admin';
import {
  loadPlatformRegistrations,
  type PlatformPlanOption,
  type TenantRegistration,
} from '@/lib/platform/registrations';
import { pickPlanSelection } from '@/lib/platform/registration-queue';
import { paymentReferenceForInvoice } from '@/lib/platform/bank-transfer';
import { formatDate, formatEUR } from '@/lib/format';
import { StatusBadge } from '@/components/platform/status-badge';
import { Button } from '@/components/ui/button';
import { activateTenantPlanAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Sprint 137 · Das Betreiber-Dashboard ist die Warteschlange eingehender
 * Registrierungen — nichts sonst.
 *
 * Vorher standen hier sieben Kennzahlen-Kacheln und keine einzige Aktion.
 * Der Betreiber sah "3 in Testphase" und musste raten, wer das ist; die
 * Freischaltung lag in einem unbeschrifteten Status-Dropdown auf der
 * Detailseite eines Mandanten, das den Tarif gar nicht mitsetzte. Wer
 * zahlt, kauft aber einen Tarif, nicht einen Status.
 *
 * Die Kennzahlen sind nicht verschwunden, sie stehen jetzt bei den
 * Agenturen (/platform/tenants) — dort, wo der ganze Kundenbestand liegt.
 */
export default async function PlatformDashboardPage() {
  await requirePlatformAdmin();
  const { plans, pending, active, archived } = await loadPlatformRegistrations();

  const expiredCount = pending.filter((t) => t.trialExpired).length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Eingehende Registrierungen</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Agenturen, die sich registriert haben und auf die Freischaltung warten. Nach
          Zahlungseingang hier den bezahlten Tarif auswählen und freischalten.
        </p>
      </header>

      <section className="flex flex-wrap gap-4">
        <SummaryTile
          label="Warten auf Freischaltung"
          value={pending.length}
          tone={pending.length > 0 ? 'attention' : 'neutral'}
        />
        <SummaryTile
          label="Testphase abgelaufen"
          value={expiredCount}
          tone={expiredCount > 0 ? 'urgent' : 'neutral'}
        />
        <SummaryTile label="Freigeschaltet" value={active.length} tone="neutral" />
      </section>

      {plans.length === 0 && (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Es sind keine Tarife hinterlegt. Ohne Tarife lässt sich keine Agentur freischalten.
        </p>
      )}

      <section className="flex flex-col gap-4">
        {pending.map((registration) => (
          <RegistrationCard
            key={registration.tenantId}
            registration={registration}
            plans={plans}
          />
        ))}

        {pending.length === 0 && (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
            Zurzeit wartet keine Registrierung auf Freischaltung.
          </div>
        )}
      </section>

      {active.length > 0 && (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
              Freigeschaltete Kunden
            </h2>
            <Link href="/platform/tenants" className="text-sm text-[var(--color-brand)] hover:underline">
              Alle Agenturen →
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-[var(--color-border)] text-sm">
            {active.map((t) => (
              <li key={t.tenantId} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <Link href={`/platform/tenants/${t.tenantId}`} className="font-medium hover:underline">
                  {t.name}
                </Link>
                <span className="text-[var(--color-muted-foreground)]">
                  {planLabel(plans, t.assignedPlanId)}
                  {t.assignedInterval && ` · ${intervalLabel(t.assignedInterval)}`}
                  {t.currentPeriodEnd && ` · bezahlt bis ${formatDate(t.currentPeriodEnd)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {archived.length > 0 && (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Suspendiert oder gekündigt
          </h2>
          <ul className="mt-3 divide-y divide-[var(--color-border)] text-sm">
            {archived.map((t) => (
              <li key={t.tenantId} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <Link href={`/platform/tenants/${t.tenantId}`} className="hover:underline">
                  {t.name}
                </Link>
                <StatusBadge status={t.subscriptionStatus} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RegistrationCard({
  registration,
  plans,
}: {
  registration: TenantRegistration;
  plans: PlatformPlanOption[];
}) {
  // Rangfolge der Vorauswahl steht in `pickPlanSelection` — dort ist sie
  // getestet, und dort steht auch, warum die offene Rechnung gewinnt.
  const selection = pickPlanSelection(registration, plans);
  const requestedPlan = registration.requestedPlanCode
    ? plans.find((p) => p.code === registration.requestedPlanCode)
    : undefined;

  const urgent = registration.trialExpired || registration.subscriptionStatus === 'past_due';
  const open = registration.openInvoice;
  // Derselbe Helper, der dem Kunden den Verwendungszweck anzeigt — sonst
  // sucht der Betreiber im Kontoauszug nach einem Text, den es nie gab.
  const openReference = open
    ? paymentReferenceForInvoice(open.invoiceNumber, registration.slug)
    : '';

  return (
    <article
      className={`rounded-2xl border bg-[var(--color-background)] p-5 shadow-sm ${
        urgent ? 'border-red-300' : 'border-[var(--color-border)]'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/platform/tenants/${registration.tenantId}`}
            className="text-lg font-medium hover:underline"
          >
            {registration.name}
          </Link>
          <div className="text-xs text-[var(--color-muted-foreground)]">
            /{registration.slug} · {registration.ownerEmail ?? 'keine Inhaber-E-Mail hinterlegt'}
          </div>
          <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Registriert am {formatDate(registration.registeredAt)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={registration.subscriptionStatus} />
          <TrialHint registration={registration} />
        </div>
      </div>

      <p className="mt-3 text-sm">
        <span className="text-[var(--color-muted-foreground)]">Bestellt: </span>
        {requestedPlan ? (
          <span className="font-medium">
            {requestedPlan.name} · {intervalLabel(registration.requestedInterval ?? 'monthly')} ·{' '}
            {formatEUR(
              (registration.requestedInterval ?? 'monthly') === 'yearly'
                ? requestedPlan.yearlyCents
                : requestedPlan.monthlyCents,
            )}
          </span>
        ) : registration.assignedPlanId ? (
          <span className="font-medium">{planLabel(plans, registration.assignedPlanId)}</span>
        ) : (
          <span className="text-[var(--color-muted-foreground)]">
            kein Tarif aus der Registrierung übermittelt — bitte beim Kunden erfragen
          </span>
        )}
      </p>

      {open && (
        <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-3 text-sm">
          <div className="font-medium">
            Der Kunde hat eine Rechnung angefordert: {open.invoiceNumber} ·{' '}
            {formatEUR(open.totalCents)}
          </div>
          <div className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
            Ausgestellt am {formatDate(open.issuedAt)}
            {open.dueAt && ` · fällig ${formatDate(open.dueAt)}`} · Verwendungszweck auf der
            Überweisung: <span className="font-mono">{openReference}</span>
          </div>
          <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Beim Freischalten auf denselben Tarif wird genau diese Rechnung bezahlt gebucht —
            es entsteht keine zweite.
          </div>
        </div>
      )}

      <form
        action={activateTenantPlanAction}
        className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--color-border)] pt-4"
      >
        <input type="hidden" name="tenantId" value={registration.tenantId} />

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Bezahlter Tarif</span>
          <select
            name="planId"
            defaultValue={selection.planId}
            required
            className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatEUR(p.monthlyCents)}/Monat · {formatEUR(p.yearlyCents)}/Jahr
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Zahlungsweise</span>
          <select
            name="interval"
            defaultValue={selection.interval}
            className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm"
          >
            <option value="monthly">Monatlich</option>
            <option value="yearly">Jährlich</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Bankreferenz (optional)</span>
          <input
            type="text"
            name="paymentReference"
            maxLength={140}
            defaultValue={openReference}
            placeholder="z. B. Verwendungszweck"
            className="w-52 rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm"
          />
        </label>

        <Button variant="primary" size="sm" type="submit" disabled={plans.length === 0}>
          Nach Zahlungseingang freischalten
        </Button>
      </form>

      <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
        {open
          ? 'Bei gleichem Tarif wird die offene Rechnung bezahlt gebucht. Bei abweichendem Tarif wird sie storniert und eine neue als Beleg angelegt.'
          : 'Die Freischaltung legt eine bezahlte Rechnung als Beleg an und setzt den Abrechnungszeitraum im Anschluss an die Testphase.'}
      </p>
    </article>
  );
}

function TrialHint({ registration }: { registration: TenantRegistration }) {
  if (registration.subscriptionStatus === 'past_due') {
    return <span className="text-xs font-medium text-red-700">Zahlung überfällig</span>;
  }
  if (registration.trialEndsAt === null) {
    return <span className="text-xs text-[var(--color-muted-foreground)]">keine Testphase</span>;
  }
  if (registration.trialExpired) {
    return (
      <span className="text-xs font-medium text-red-700">
        Testphase abgelaufen ({formatDate(registration.trialEndsAt)})
      </span>
    );
  }
  const days = registration.trialDaysLeft ?? 0;
  return (
    <span className={`text-xs ${days <= 7 ? 'font-medium text-amber-700' : 'text-[var(--color-muted-foreground)]'}`}>
      noch {days} {days === 1 ? 'Tag' : 'Tage'} Testphase (bis {formatDate(registration.trialEndsAt)})
    </span>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'attention' | 'urgent';
}) {
  const toneClass =
    tone === 'urgent'
      ? 'border-red-300 bg-red-50'
      : tone === 'attention'
        ? 'border-amber-300 bg-amber-50'
        : 'border-[var(--color-border)] bg-[var(--color-background)]';
  return (
    <div className={`min-w-40 flex-1 rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function planLabel(plans: PlatformPlanOption[], planId: string | null): string {
  if (!planId) return 'kein Tarif';
  return plans.find((p) => p.id === planId)?.name ?? 'unbekannter Tarif';
}

function intervalLabel(interval: 'monthly' | 'yearly'): string {
  return interval === 'yearly' ? 'jährlich' : 'monatlich';
}
