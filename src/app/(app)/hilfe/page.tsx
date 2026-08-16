import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { getAvailableModules } from '@/lib/modules/enabled';
import { moduleForPath } from '@/lib/modules/module-map';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { legalConfig, formatAddress } from '@/lib/legal/config';

export const metadata: Metadata = { title: 'Hilfe & Kontakt' };

interface FaqItem {
  q: string;
  a: React.ReactNode;
  /**
   * Sprint 119: Die Route, um die es in der Frage geht — sofern sie zu einem
   * abschaltbaren Modul gehoert. Hier steht bewusst der Pfad und kein
   * Modulschluessel: das Modul wird ueber `moduleForPath` daraus abgeleitet,
   * genau wie bei `ModuleLink`. Ein zweiter Ort, an dem Route und Modul von
   * Hand zusammengefuehrt werden, laeuft beim naechsten Routen-Umbau
   * auseinander.
   *
   * Antworten OHNE `topic` betreffen Kernrouten (/dashboard, /settings/...)
   * und stehen jedem Mandanten zu.
   */
  topic?: string;
}

const FAQ: FaqItem[] = [
  {
    q: 'Wie starte ich mit der App?',
    a: (
      <>
        Legen Sie im{' '}
        <Link href="/dashboard" className="text-[var(--color-primary)] underline">
          Dashboard
        </Link>{' '}
        Ihr erstes Objekt an, laden Sie Mitarbeiter ein und erstellen Sie einen
        ersten Auftrag. Der Willkommens-Assistent nach dem Login führt Sie durch
        diese vier Schritte. Alternativ können Sie in{' '}
        <Link href="/settings/tenant" className="text-[var(--color-primary)] underline">
          Einstellungen → Mandant
        </Link>{' '}
        Beispieldaten laden, um die App risikofrei auszuprobieren.
      </>
    ),
  },
  {
    q: 'Wie lade ich Mitarbeiter ein?',
    topic: '/people/employees',
    a: (
      <>
        Unter{' '}
        <Link href="/people/employees" className="text-[var(--color-primary)] underline">
          Personen → Mitarbeiter
        </Link>{' '}
        legen Sie neue Mitarbeiter mit E-Mail-Adresse an. Der Mitarbeiter erhält
        eine Einladungs-E-Mail und kann sich mit seinem eigenen Passwort
        einloggen. Anschließend weisen Sie unter{' '}
        <Link href="/settings/users" className="text-[var(--color-primary)] underline">
          Einstellungen → Benutzer &amp; Rollen
        </Link>{' '}
        eine Rolle zu (z. B. Vorarbeiter, Hausmeister, Reinigungskraft).
      </>
    ),
  },
  {
    q: 'Wie funktioniert die Zahlung?',
    a: (
      <>
        Die App wird ausschließlich per Banküberweisung bezahlt — es gibt keine
        Kreditkarten-Anbindung und keinen automatischen Bankeinzug. Nach der
        14-tägigen kostenlosen Testphase erhalten Sie unter{' '}
        <Link href="/settings/subscription" className="text-[var(--color-primary)] underline">
          Einstellungen → Abo &amp; Rechnungen
        </Link>{' '}
        eine Rechnung mit IBAN und Verwendungszweck. Nach Zahlungseingang wird
        das Abo manuell für den gebuchten Zeitraum freigeschaltet.
      </>
    ),
  },
  {
    q: 'Was passiert, wenn meine Testphase abläuft?',
    a: (
      <>
        Kurz vor Ablauf sehen Sie im Header einen Hinweis. Läuft die Testphase
        ab, ohne dass eine Zahlung eingegangen ist, wird der Zugang zu den
        Modulen pausiert — Ihre Daten bleiben jedoch erhalten. Sie kommen dann
        weiterhin an{' '}
        <Link href="/settings/subscription" className="text-[var(--color-primary)] underline">
          Abo &amp; Rechnungen
        </Link>
        , Impressum und Datenschutz. Sobald die Überweisung eingegangen und
        bestätigt ist, ist die App wieder vollständig nutzbar.
      </>
    ),
  },
  {
    q: 'Wo finde ich meine Rechnungen von Hausmeisterservice?',
    a: (
      <>
        Unter{' '}
        <Link href="/settings/subscription" className="text-[var(--color-primary)] underline">
          Einstellungen → Abo &amp; Rechnungen
        </Link>{' '}
        sehen Sie alle bisherigen Plattform-Rechnungen und können jede als PDF
        herunterladen.
      </>
    ),
  },
  {
    q: 'Wie erstelle ich eine Rechnung an meinen Kunden?',
    topic: '/billing',
    a: (
      <>
        Unter{' '}
        <Link href="/billing" className="text-[var(--color-primary)] underline">
          Abrechnung
        </Link>{' '}
        legen Sie Angebote und Rechnungen an, die Sie an Ihre Auftraggeber
        senden. Damit die PDFs korrekt sind, hinterlegen Sie zuvor unter{' '}
        <Link href="/settings/tenant" className="text-[var(--color-primary)] underline">
          Einstellungen → Mandant
        </Link>{' '}
        Ihre Firmen-Anschrift, Steuernummer und Bankverbindung.
      </>
    ),
  },
  {
    q: 'Kann ich meine Daten exportieren?',
    topic: '/reports',
    a: (
      <>
        Ja. In den meisten Listen (Aufträge, Zeiterfassung, Materialien) finden
        Sie oben rechts einen CSV-Export-Button. Reporting-Auswertungen unter{' '}
        <Link href="/reports" className="text-[var(--color-primary)] underline">
          Reporting
        </Link>{' '}
        lassen sich ebenfalls als CSV herunterladen. Für einen kompletten Export
        Ihres Mandanten schreiben Sie uns kurz — wir liefern eine JSON-Datei
        aller Ihrer Daten.
      </>
    ),
  },
  {
    q: 'Wie kündige ich meinen Account?',
    a: (
      <>
        Schreiben Sie uns eine E-Mail an{' '}
        <a
          href={`mailto:${legalConfig.contact.email}`}
          className="text-[var(--color-primary)] underline"
        >
          {legalConfig.contact.email}
        </a>
        . Wir löschen Ihren Mandanten inklusive aller Daten innerhalb von 30
        Tagen. Auf Wunsch senden wir Ihnen vorher einen kompletten Export.
      </>
    ),
  },
  {
    q: 'Brauche ich einen Auftragsverarbeitungsvertrag (AVV) mit euch?',
    a: (
      <>
        Ja — sobald Sie personenbezogene Daten Ihrer Mitarbeiter, Bewohner oder
        Eigentümer in der App speichern, sind Sie nach Art. 28 DSGVO verpflichtet,
        einen AVV mit uns abzuschließen. Details, Ablauf und einen vorbereiteten
        E-Mail-Entwurf zum Anfordern finden Sie unter{' '}
        <Link href="/avv" className="text-[var(--color-primary)] underline">
          Auftragsverarbeitungsvertrag (AVV)
        </Link>
        .
      </>
    ),
  },
  {
    q: 'Meine Frage steht hier nicht — was jetzt?',
    a: (
      <>
        Schreiben Sie uns direkt per E-Mail — Kontaktdaten stehen unten. Wir
        antworten in der Regel innerhalb eines Werktags.
      </>
    ),
  },
];

export default async function HilfePage() {
  // Sprint 119: Eine Antwort zu einem abgeschalteten Modul ist schlimmer als
  // keine Antwort — sie beschreibt eine Funktion, die dieser Mandant nicht
  // hat, und schickt ihn ueber einen Link ins 404. Also faellt die Frage
  // ganz weg, nicht nur ihr Link.
  const ctx = await requireTenantContext();
  const available = await getAvailableModules(ctx.tenantId);
  const faq = FAQ.filter((item) => {
    if (!item.topic) return true;
    const moduleKey = moduleForPath(item.topic);
    return moduleKey === null || available.has(moduleKey);
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Hilfe & Kontakt"
        description="Antworten auf die häufigsten Fragen. Wenn Sie hier nichts finden, melden Sie sich einfach."
      />

      <Card>
        <CardHeader>
          <CardTitle>Häufige Fragen</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <ul className="divide-y divide-[var(--color-border)]">
            {faq.map((item, i) => (
              <li key={i}>
                <details className="group">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 text-sm font-medium hover:bg-[var(--color-muted)]/50 [&::-webkit-details-marker]:hidden">
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
                  <div className="px-4 pb-4 text-sm text-[var(--color-muted-foreground)]">
                    {item.a}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kontakt</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <ContactRow label="E-Mail">
            <a
              href={`mailto:${legalConfig.contact.email}`}
              className="text-[var(--color-primary)] underline"
            >
              {legalConfig.contact.email}
            </a>
          </ContactRow>
          <ContactRow label="Telefon">
            <a
              href={`tel:${legalConfig.contact.phone.replace(/\s+/g, '')}`}
              className="text-[var(--color-primary)] underline"
            >
              {legalConfig.contact.phone}
            </a>
          </ContactRow>
          <ContactRow label="Anschrift" className="sm:col-span-2">
            <span className="whitespace-pre-line">
              {legalConfig.company.name}
              {'\n'}
              {formatAddress()}
            </span>
          </ContactRow>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rechtliches</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-wrap gap-3 text-sm">
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
          <Link
            href="/avv"
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 hover:bg-[var(--color-muted)]/50"
          >
            Auftragsverarbeitung (AVV)
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}

function ContactRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}
