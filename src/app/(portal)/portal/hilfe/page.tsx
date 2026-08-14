import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Hilfe · Bewohner-Portal',
};

interface FaqItem {
  q: string;
  a: React.ReactNode;
}

const FAQ: FaqItem[] = [
  {
    q: 'Wie melde ich einen Mangel oder ein Anliegen?',
    a: (
      <>
        Öffnen Sie{' '}
        <Link href="/portal/defects/new" className="text-[var(--color-primary)] underline">
          Meldungen → Neuen Mangel melden
        </Link>{' '}
        und beschreiben Sie kurz, worum es geht. Fügen Sie nach Möglichkeit ein
        Foto bei — das hilft der Hausverwaltung, das Anliegen schneller
        einzuordnen. Ihre Meldung wird automatisch übermittelt.
      </>
    ),
  },
  {
    q: 'Was passiert, nachdem ich eine Meldung abgeschickt habe?',
    a: (
      <>
        Die Hausverwaltung sieht Ihre Meldung sofort in ihrem System und
        entscheidet, wie es weitergeht — etwa Handwerker beauftragen oder
        Rückfragen stellen. Den Status können Sie jederzeit unter{' '}
        <Link href="/portal/defects" className="text-[var(--color-primary)] underline">
          Meldungen
        </Link>{' '}
        einsehen: „Neu" (eingegangen), „In Prüfung" (Hausverwaltung schaut sich
        das Anliegen an) oder abgeschlossen.
      </>
    ),
  },
  {
    q: 'Wie schreibe ich eine Nachricht an die Hausverwaltung?',
    a: (
      <>
        Nachrichten-Konversationen werden von der Hausverwaltung gestartet.
        Sobald eine bestehende Konversation existiert, können Sie unter{' '}
        <Link href="/portal/messages" className="text-[var(--color-primary)] underline">
          Nachrichten
        </Link>{' '}
        antworten. Für neue Anliegen ist die direkteste Route eine{' '}
        <Link href="/portal/defects/new" className="text-[var(--color-primary)] underline">
          neue Meldung
        </Link>
        {' '}— dort kann die Hausverwaltung ebenfalls antworten.
      </>
    ),
  },
  {
    q: 'Wo finde ich Ankündigungen meiner Hausverwaltung?',
    a: (
      <>
        Unter{' '}
        <Link href="/portal/announcements" className="text-[var(--color-primary)] underline">
          Ankündigungen
        </Link>{' '}
        sehen Sie alle Mitteilungen, die für Ihr Objekt oder Ihre Wohnung
        veröffentlicht wurden. Ungelesene Ankündigungen sind mit einem farbigen
        Punkt markiert. Manche Ankündigungen bitten um eine Kenntnisnahme —
        die sind zusätzlich mit „quittieren" markiert.
      </>
    ),
  },
  {
    q: 'Wie sichere ich mein Konto zusätzlich ab?',
    a: (
      <>
        Aktivieren Sie unter{' '}
        <Link href="/portal/account" className="text-[var(--color-primary)] underline">
          Konto
        </Link>{' '}
        die Zwei-Faktor-Authentifizierung (2FA). Sie brauchen dafür eine
        Authenticator-App auf Ihrem Smartphone (etwa Google Authenticator,
        Microsoft Authenticator oder 1Password). Zusätzlich können Sie sich
        einmalige Recovery-Codes ausdrucken, falls Sie Ihr Smartphone verlieren.
      </>
    ),
  },
  {
    q: 'Ich habe mein Passwort vergessen — was tun?',
    a: (
      <>
        Auf der{' '}
        <Link href="/portal/login" className="text-[var(--color-primary)] underline">
          Login-Seite
        </Link>{' '}
        finden Sie den Link „Passwort vergessen". Sie erhalten eine E-Mail mit
        einem Link zum Zurücksetzen. Der Link ist aus Sicherheitsgründen nur
        kurz gültig — starten Sie bei Bedarf einfach nochmal.
      </>
    ),
  },
  {
    q: 'Wie ändere ich meine E-Mail-Adresse oder mein Passwort?',
    a: (
      <>
        Beides geht unter{' '}
        <Link href="/portal/account" className="text-[var(--color-primary)] underline">
          Konto
        </Link>
        . Für die E-Mail-Änderung bekommen Sie zur Bestätigung zwei
        Links geschickt — einen an die alte, einen an die neue Adresse. Beide
        müssen bestätigt werden, damit die Änderung wirksam wird.
      </>
    ),
  },
  {
    q: 'Wer kann meine Daten im Portal sehen?',
    a: (
      <>
        Ihre Hausverwaltung sieht Ihre Kontaktdaten, Ihre Meldungen und die
        Nachrichten, die zwischen Ihnen und ihr ausgetauscht wurden. Andere
        Bewohner sehen davon nichts. Ihre Login-Daten (Passwort, 2FA-Faktor,
        Recovery-Codes) sieht niemand außer Ihnen — auch die Hausverwaltung
        nicht.
      </>
    ),
  },
  {
    q: 'Ich sehe meine Wohnung nicht — was tun?',
    a: (
      <>
        Ihre Zuordnung zu Objekt und Wohnung pflegt die Hausverwaltung. Wenn
        Ihre Wohnung fehlt oder falsch angegeben ist, wenden Sie sich bitte
        direkt an Ihre Hausverwaltung — sie kann die Zuordnung im System
        korrigieren.
      </>
    ),
  },
  {
    q: 'Wie melde ich mich vom Portal ab?',
    a: (
      <>
        Klicken Sie rechts oben auf Ihren Namen und wählen Sie „Abmelden". Auf
        gemeinsam genutzten Geräten (Bibliothek, Familien-PC) sollten Sie sich
        immer abmelden, bevor Sie das Fenster schließen.
      </>
    ),
  },
  {
    q: 'Meine Frage steht hier nicht — was jetzt?',
    a: (
      <>
        Am direktesten erreichen Sie Ihre Hausverwaltung, indem Sie eine{' '}
        <Link href="/portal/defects/new" className="text-[var(--color-primary)] underline">
          neue Meldung
        </Link>{' '}
        anlegen. Auch für allgemeine Fragen ist das der schnellste Weg — Sie
        beschreiben Ihr Anliegen einfach im Freitext, und die Hausverwaltung
        meldet sich zurück.
      </>
    ),
  },
];

export default function PortalHilfePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Hilfe</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Antworten auf die häufigsten Fragen rund um das Bewohner-Portal.
        </p>
      </div>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]">
        <header className="border-b border-[var(--color-border)] px-5 py-3">
          <h2 className="text-sm font-semibold">Häufige Fragen</h2>
        </header>
        <ul className="divide-y divide-[var(--color-border)]">
          {FAQ.map((item, i) => (
            <li key={i}>
              <details className="group">
                <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-3 text-sm font-medium hover:bg-[var(--color-muted)]/50 [&::-webkit-details-marker]:hidden">
                  <span>{item.q}</span>
                  <svg
                    className="size-4 shrink-0 text-[var(--color-muted-foreground)] transition group-open:rotate-180"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 6l4 4 4-4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </summary>
                <div className="px-5 pb-4 text-sm text-[var(--color-muted-foreground)]">
                  {item.a}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <h2 className="text-sm font-semibold">So erreichen Sie Ihre Hausverwaltung</h2>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          Für alle Fragen und Anliegen rund um Ihr Objekt ist Ihre
          Hausverwaltung Ihr direkter Ansprechpartner. Am schnellsten geht es
          über eine neue Meldung — die landet sofort im System der
          Hausverwaltung.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/portal/defects/new"
            className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            Neue Meldung erstellen
          </Link>
          <Link
            href="/portal/messages"
            className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]/50"
          >
            Zu meinen Nachrichten
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <h2 className="text-sm font-semibold">Rechtliches</h2>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link
            href="/impressum"
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 hover:bg-[var(--color-muted)]/50"
          >
            Impressum
          </Link>
          <Link
            href="/datenschutz"
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 hover:bg-[var(--color-muted)]/50"
          >
            Datenschutz
          </Link>
          <Link
            href="/agb"
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 hover:bg-[var(--color-muted)]/50"
          >
            AGB
          </Link>
        </div>
      </section>
    </div>
  );
}
