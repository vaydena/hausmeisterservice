import Link from 'next/link';
import type { Metadata } from 'next';
import { clientEnv } from '@/lib/env';
import { createPlatformServiceClient } from '@/lib/supabase/platform';
import { FEATURE_KEYS, FEATURE_LABEL } from '@/lib/tenant/feature-map';

export const metadata: Metadata = {
  title: 'Preise',
  description: 'Transparente Monats- und Jahres-Pakete — 14 Tage kostenlos testen, keine Vorab-Zahlung.',
};

export const revalidate = 300;

/**
 * Sprint 115: Die Liste kommt bewusst aus feature-map.ts und wird hier
 * nicht zweitgepflegt. Seit Sprint 114 setzt das Gate durch, was diese
 * Seite verspricht — eine eigene Kopie hiesse, dass der Kunde etwas kauft,
 * das die App ihm anschliessend verweigert (oder dass ein enthaltenes
 * Feature hier gar nicht auftaucht). Aus demselben Grund derselbe
 * Wortlaut wie auf der Sperrseite: der Kunde liest hier "GPS-Tracking &
 * Touren" und spaeter "Benoetigt GPS-Tracking & Touren".
 */

export default async function PreisePage() {
  const { data: plans } = await createPlatformServiceClient()
    .from('subscription_plans')
    .select('*')
    .eq('is_public', true)
    .order('sort_order');

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Transparente Preise, monatlich kündbar
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-[var(--color-muted-foreground)] md:text-base">
          Alle Pläne kommen mit 14 Tagen kostenloser Testphase — keine Kreditkarte, keine Vorab-Zahlung.
          Bei Jahreszahlung sparst du zwei Monate.
        </p>
      </header>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        {(plans ?? []).map((plan) => {
          const features = (plan.features as Record<string, boolean> | null) ?? {};
          return (
            <div
              key={plan.id}
              className="flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm"
            >
              <div className="text-sm font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                {plan.name}
              </div>
              <div className="mt-3 text-4xl font-semibold tracking-tight">
                {(plan.monthly_price_cents / 100).toLocaleString('de-DE')} €
                <span className="text-sm font-normal text-[var(--color-muted-foreground)]">/Monat</span>
              </div>
              <div className="text-xs text-[var(--color-muted-foreground)]">
                oder {(plan.yearly_price_cents / 100).toLocaleString('de-DE')} € pro Jahr
                <span className="ml-1 text-emerald-700">(Ersparnis)</span>
              </div>
              <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
                {plan.description}
              </p>
              <ul className="mt-4 space-y-1.5 text-sm">
                <li>• bis {plan.max_employees ?? '∞'} Mitarbeiter</li>
                <li>• bis {plan.max_properties ?? '∞'} Objekte</li>
                {FEATURE_KEYS.map((key) => (
                  <li key={key} className={features[key] ? '' : 'text-[var(--color-muted-foreground)] line-through'}>
                    {features[key] ? '✓' : '—'} {FEATURE_LABEL[key]}
                  </li>
                ))}
              </ul>
              <Link
                href={`/signup?plan=${plan.code}`}
                className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90"
              >
                14 Tage kostenlos testen
              </Link>
            </div>
          );
        })}
      </section>

      <section className="mt-16 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-8">
        <h2 className="text-lg font-semibold">Häufige Fragen</h2>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="font-medium">Kann ich jederzeit kündigen?</dt>
            <dd className="mt-1 text-[var(--color-muted-foreground)]">
              Ja. Monatliche Abos zum Monatsende, jährliche zum Ende der bezahlten Laufzeit.
              Keine Vertragsbindung darüber hinaus.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Was passiert nach den 14 Tagen?</dt>
            <dd className="mt-1 text-[var(--color-muted-foreground)]">
              Wir stellen dir eine Rechnung für den gewählten Plan. Erst wenn diese
              bezahlt ist, wird dein Zugang aktiv weitergeführt — kein automatischer Bankeinzug.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Wie zahle ich?</dt>
            <dd className="mt-1 text-[var(--color-muted-foreground)]">
              Per Banküberweisung. Du bekommst nach Ablauf der Testphase eine
              Rechnung mit IBAN und Verwendungszweck — kein automatischer Bankeinzug,
              keine Kreditkarten-Daten nötig.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Kann ich später den Plan wechseln?</dt>
            <dd className="mt-1 text-[var(--color-muted-foreground)]">
              Jederzeit im Bereich <em>Abo &amp; Rechnungen</em>. Höherstufungen wirken ab der nächsten
              Rechnungsperiode.
            </dd>
          </div>
        </dl>
      </section>

      <footer className="mt-16 text-center text-xs text-[var(--color-muted-foreground)]">
        <div className="space-x-4">
          <Link href="/impressum" className="hover:underline">Impressum</Link>
          <Link href="/datenschutz" className="hover:underline">Datenschutz</Link>
          <Link href="/agb" className="hover:underline">AGB</Link>
          <Link href="/login" className="hover:underline">Anmelden</Link>
        </div>
        <div className="mt-2">© {new Date().getFullYear()} {clientEnv.NEXT_PUBLIC_APP_NAME}</div>
      </footer>
    </div>
  );
}
