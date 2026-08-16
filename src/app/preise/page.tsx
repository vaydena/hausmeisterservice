import Link from 'next/link';
import type { Metadata } from 'next';
import * as Sentry from '@sentry/nextjs';
import { clientEnv } from '@/lib/env';
import { legalConfig } from '@/lib/legal/config';
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
  const { data: plans, error: plansError } = await createPlatformServiceClient()
    .from('subscription_plans')
    .select('*')
    .eq('is_public', true)
    .order('sort_order');

  // Sprint 116: Bis hierher stand hier `const { data: plans }` — die
  // Fehlerhaelfte fiel weg, `(plans ?? [])` machte daraus eine leere Liste,
  // und die Seite rendert ihren voellig normalen Leerzustand. Genau so ist
  // monatelang niemandem aufgefallen, dass das Schema `platform` in
  // PostgREST nie exponiert war (PGRST106): die oeffentliche Preisseite
  // zeigte keinen einzigen Tarif und keinen Signup-Button, und nichts hat
  // Alarm geschlagen.
  //
  // Anders als in der uebrigen Guard-Schicht wird hier NICHT geworfen. Das
  // ist die Verkaufsseite: eine Fehlerseite nimmt dem Interessenten auch
  // noch FAQ, Impressum und den Weg zum Login, waehrend der Rest der Seite
  // ohne die Tarife problemlos steht. Sichtbar muss die Stoerung trotzdem
  // werden — fuer den Besucher als ehrlicher Hinweis statt eines
  // vorgetaeuschten "kein Angebot", und fuer den Betreiber ueber Sentry.
  if (plansError) {
    Sentry.captureException(
      new Error(
        `Preisseite: Tarife konnten nicht geladen werden${plansError.code ? ` [${plansError.code}]` : ''}: ${plansError.message}`,
      ),
      { extra: { details: plansError.details, hint: plansError.hint } },
    );
  }

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

      {plansError ? (
        <section className="mt-10 rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <h2 className="text-base font-semibold">Die Tarife lassen sich gerade nicht laden</h2>
          <p className="mt-2">
            Das liegt an uns, nicht an dir. Versuch es in ein paar Minuten noch einmal — oder
            schreib uns an{' '}
            <a href={`mailto:${legalConfig.contact.email}`} className="underline">
              {legalConfig.contact.email}
            </a>
            , dann nennen wir dir die Konditionen direkt.
          </p>
          <p className="mt-2">
            Die kostenlose Testphase kannst du unabhängig davon starten — der Tarif lässt sich
            später unter <em>Abo &amp; Rechnungen</em> wählen.
          </p>
          <Link
            href="/signup"
            className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90"
          >
            14 Tage kostenlos testen
          </Link>
        </section>
      ) : (plans ?? []).length === 0 ? (
        <section className="mt-10 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 text-sm text-[var(--color-muted-foreground)]">
          Zurzeit ist kein Tarif öffentlich buchbar. Melde dich bei{' '}
          <a href={`mailto:${legalConfig.contact.email}`} className="underline">
            {legalConfig.contact.email}
          </a>
          , wir finden ein passendes Paket für dich.
        </section>
      ) : (
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
      )}

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
