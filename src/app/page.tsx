import Link from 'next/link';
import type { Metadata } from 'next';
import { clientEnv } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Hausmeisterservice-Software',
  description:
    'Objekte, Aufträge, Zeiterfassung, Mängelmeldungen, Rechnungen — alles in einer App. 14 Tage kostenlos testen, keine Kreditkarte nötig.',
};

export const revalidate = 3600;

const APP_NAME = 'Hausmeisterservice';

const FEATURES: Array<{ title: string; body: string }> = [
  {
    title: 'Objekte & Aufträge',
    body: 'Alle betreuten Objekte, Wohnungen und offenen Tickets an einem Ort — von der Meldung bis zum Abschluss mit Foto und Unterschrift.',
  },
  {
    // Sprint 140: hier stand "Zeiterfassung mit GPS" und "optional mit
    // Standort". Beides war unbelegt — `time_entries` hat in keiner Migration
    // eine Koordinatenspalte. Was hier steht, muss die App koennen.
    title: 'Mobile Zeiterfassung',
    body: 'Mitarbeiter stempeln unterwegs ein und aus. Manuelle Korrekturen mit Freigabe-Workflow und CSV-Export für die Lohnbuchhaltung.',
  },
  {
    title: 'Bewohner- & Eigentümer-Portal',
    body: 'Mieter melden Mängel selbst, sehen den Bearbeitungsstand und bekommen Ankündigungen. Kein Anruf mehr wegen der Waschküche.',
  },
  {
    title: 'Instandhaltung & Fristen',
    body: 'Wiederkehrende Wartungen für Aufzüge, Heizung, Feuerlöscher — mit automatischer Erinnerung und lückenlosem Nachweis.',
  },
  {
    title: 'Rechnungen & Angebote',
    body: 'Angebote und Rechnungen mit einem Klick als PDF, direkt per E-Mail an den Eigentümer. Kleinunternehmer-konform nach §19 UStG.',
  },
  {
    title: 'Automatisierungen',
    body: 'Regeln wie „Bei neuer Mängelmeldung Foto an Eigentümer schicken" laufen im Hintergrund — ohne dass jemand daran denken muss.',
  },
];

const SECONDARY_FEATURES = [
  'Fuhrpark mit TÜV-Erinnerung',
  'Schlüssel-Verwaltung mit Übergabeprotokoll',
  'Zählerstände & Verbrauchsverfolgung',
  'Material- und Lagerbestand',
  'Touren-Planung mit Stopps',
  'Interne Nachrichten & Ankündigungen',
  'QR-Codes für Objekte und Schlüssel',
  'Reports mit CSV-Export',
];

const AUDIENCES: Array<{ headline: string; body: string }> = [
  {
    headline: 'Hausmeister-Betriebe',
    body: 'Kleine Teams von 2–5 Personen bis zu größeren Betrieben mit eigenem Fuhrpark, mehreren Objekten und Bereitschaftsdiensten.',
  },
  {
    headline: 'Facility-Management',
    body: 'Zentrale Steuerung mehrerer Standorte, delegierte Zuständigkeiten, konsolidierte Reports pro Auftraggeber.',
  },
  {
    headline: 'WEG- & Immobilienverwalter',
    body: 'Wenn der Hausmeisterservice ausgelagert ist: klare Schnittstelle für Aufträge, Nachweise und Abrechnung.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-[var(--color-background)] text-[var(--color-foreground)]">
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="text-sm font-semibold tracking-tight">{APP_NAME}</div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/preise" className="hover:underline">
              Preise
            </Link>
            <Link
              href="/login"
              className="text-[var(--color-muted-foreground)] hover:underline"
            >
              Anmelden
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-3 text-xs font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90"
            >
              14 Tage kostenlos testen
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pt-16 pb-12 sm:px-6 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
              Die Software für den Hausmeisterservice — endlich ohne Zettel und WhatsApp.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-[var(--color-muted-foreground)] md:text-lg">
              Objekte, Aufträge, Zeiterfassung, Mängelmeldungen, Rechnungen — alles in
              einer App. Vom Handy für draußen, vom Rechner fürs Büro.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center rounded-md bg-[var(--color-primary)] px-5 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90"
              >
                14 Tage kostenlos testen
              </Link>
              <Link
                href="/preise"
                className="inline-flex h-11 items-center rounded-md border border-[var(--color-border)] px-5 text-sm font-medium hover:bg-[var(--color-muted)]/50"
              >
                Preise ansehen
              </Link>
            </div>
            <p className="mt-4 text-xs text-[var(--color-muted-foreground)]">
              Keine Kreditkarte nötig · monatlich kündbar · Server in Deutschland
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Was drin ist</h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted-foreground)]">
            Kein Baukasten zum Selbstzusammenklicken — die wichtigsten Werkzeuge sind
            von Anfang an dabei und arbeiten zusammen.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 shadow-sm"
              >
                <div className="text-base font-medium">{f.title}</div>
                <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-dashed border-[var(--color-border)] p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
              und außerdem
            </div>
            <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 md:grid-cols-4">
              {SECONDARY_FEATURES.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Für wen wir es bauen</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {AUDIENCES.map((a) => (
              <div
                key={a.headline}
                className="rounded-2xl border border-[var(--color-border)] p-5"
              >
                <div className="text-base font-medium">{a.headline}</div>
                <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                  {a.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-8 md:p-12">
            <div className="grid gap-8 md:grid-cols-2 md:items-center">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Ehrliche Preise, keine Überraschungen.
                </h2>
                <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
                  Drei Pakete, monatlich oder jährlich (2 Monate gespart). 14 Tage
                  kostenlos testen — erst nach Ablauf der Testphase bekommst du eine
                  Rechnung, und erst nach deren Zahlung geht es aktiv weiter. Kein
                  automatischer Bankeinzug.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="/preise"
                    className="inline-flex h-11 items-center rounded-md bg-[var(--color-primary)] px-5 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90"
                  >
                    Alle Preise ansehen
                  </Link>
                  <Link
                    href="/signup"
                    className="inline-flex h-11 items-center rounded-md border border-[var(--color-border)] px-5 text-sm font-medium hover:bg-[var(--color-background)]"
                  >
                    Direkt loslegen
                  </Link>
                </div>
              </div>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-700">✓</span>
                  <span>Ab 49 € pro Monat, alle Basis-Funktionen enthalten</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-700">✓</span>
                  <span>Monatlich kündbar, keine Vertragslaufzeit</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-700">✓</span>
                  <span>DSGVO-konform, Hosting in der EU</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-700">✓</span>
                  <span>Deutsche Oberfläche, deutscher Support</span>
                </li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--color-border)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-[var(--color-muted-foreground)] sm:flex-row sm:px-6">
          <div>
            © {new Date().getFullYear()} {clientEnv.NEXT_PUBLIC_APP_NAME ?? APP_NAME}
          </div>
          <nav className="flex flex-wrap items-center gap-4">
            <Link href="/impressum" className="hover:underline">
              Impressum
            </Link>
            <Link href="/datenschutz" className="hover:underline">
              Datenschutz
            </Link>
            <Link href="/agb" className="hover:underline">
              AGB
            </Link>
            <Link href="/preise" className="hover:underline">
              Preise
            </Link>
            <Link href="/login" className="hover:underline">
              Anmelden
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
