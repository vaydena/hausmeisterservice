import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { legalConfig } from '@/lib/legal/config';
import { ExportDataButton } from './export-button';

export const metadata: Metadata = { title: 'Datenschutz' };

export default async function PrivacySettingsPage() {
  const ctx = await requireTenantContext();
  const contactEmail = legalConfig.contact.email;
  const productName = legalConfig.productName;

  const deletionSubject = encodeURIComponent(
    `Loeschantrag nach Art. 17 DSGVO — ${productName}`,
  );
  const deletionBody = encodeURIComponent(
    [
      'Sehr geehrte Damen und Herren,',
      '',
      `hiermit beantrage ich die Loeschung meiner personenbezogenen Daten bei ${productName} gemaess Art. 17 DSGVO.`,
      '',
      `Mein Nutzerkonto (E-Mail): ${ctx.email ?? '<bitte ergaenzen>'}`,
      `Interne User-ID: ${ctx.userId}`,
      '',
      'Bitte bestaetigen Sie mir den Eingang und den Zeitpunkt der Loeschung schriftlich.',
      '',
      'Mit freundlichen Gruessen',
      ctx.displayName ?? '',
    ].join('\n'),
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Datenschutz"
        description="Ihre Rechte als betroffene Person nach der DSGVO. Auskunft und Loeschantrag im Selbstbedienungs-Modus."
      />

      <Card>
        <CardHeader>
          <CardTitle>Datenauskunft (Art. 15 DSGVO)</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Laden Sie alle personenbezogenen Daten herunter, die zu Ihrem
              Nutzerkonto in dieser Anwendung gespeichert sind — als
              maschinenlesbare JSON-Datei. Enthalten sind unter anderem
              Profil-, Rollen- und Mitgliedschaftsdaten, Zeiterfassung,
              Nachrichten, Benachrichtigungen sowie von Ihnen angelegte
              Auftraege, Meldungen und Dokumente.
            </p>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Datensaetze, die andere Personen betreffen (z. B. Adressen
              von Bewohnern, die Sie bearbeitet haben), sind nicht Teil
              dieses Exports — ihre Auskunftsrechte muessen von den
              betreffenden Personen selbst ausgeuebt werden.
            </p>
            <div>
              <ExportDataButton />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Loeschantrag (Art. 17 DSGVO)</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Sie haben das Recht auf Loeschung Ihrer personenbezogenen
              Daten. Wir bearbeiten Loeschantraege manuell, damit wir
              gesetzliche Aufbewahrungsfristen (z. B. steuerlich relevante
              Rechnungsdaten) korrekt beruecksichtigen koennen.
            </p>
            {ctx.isOwner ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                <strong>Hinweis fuer Inhaber-Konten:</strong> Als Inhaber
                Ihres Mandanten koennen Sie nicht einfach nur Ihr
                Einzelkonto loeschen, ohne den Mandanten selbst zu
                beenden. Der Loeschantrag bewirkt daher eine
                Vertragskuendigung und die Loeschung aller Daten Ihres
                Mandanten nach der gesetzlichen Aufbewahrungsfrist.
                Bitte stellen Sie ggf. zuvor die weitere Nutzung durch
                einen anderen Verantwortlichen sicher.
              </p>
            ) : (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Ihr Konto ist einem Mandanten zugeordnet. Der Inhaber
                Ihres Mandanten kann Ihre Mitgliedschaft direkt in den
                Benutzer-Einstellungen beenden — schneller als per
                E-Mail an uns. Alternativ nutzen Sie den Antrag unten.
              </p>
            )}
            <div className="flex flex-col gap-2">
              <a
                href={`mailto:${contactEmail}?subject=${deletionSubject}&body=${deletionBody}`}
                className="inline-flex w-fit items-center justify-center rounded-md bg-[var(--color-destructive)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Loeschantrag per E-Mail stellen
              </a>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Oeffnet Ihr E-Mail-Programm mit vorausgefuelltem Text an{' '}
                <code>{contactEmail}</code>.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weitere Betroffenenrechte</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-3 text-sm text-[var(--color-muted-foreground)]">
            Neben Auskunft und Loeschung haben Sie folgende weitere
            Rechte nach der DSGVO:
          </p>
          <ul className="list-disc space-y-1 pl-6 text-sm text-[var(--color-muted-foreground)]">
            <li>Recht auf Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
            <li>Recht auf Einschraenkung der Verarbeitung (Art. 18 DSGVO)</li>
            <li>Recht auf Datenuebertragbarkeit (Art. 20 DSGVO)</li>
            <li>Widerspruchsrecht (Art. 21 DSGVO)</li>
            <li>Widerruf einer erteilten Einwilligung (Art. 7 Abs. 3 DSGVO)</li>
            <li>Beschwerderecht bei der Aufsichtsbehoerde (Art. 77 DSGVO)</li>
          </ul>
          <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
            Zur Ausuebung dieser Rechte wenden Sie sich bitte an{' '}
            <a
              href={`mailto:${contactEmail}`}
              className="text-[var(--color-primary)] hover:underline"
            >
              {contactEmail}
            </a>
            . Ausfuehrliche Informationen finden Sie in unserer{' '}
            <Link
              href="/datenschutz"
              className="text-[var(--color-primary)] hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Datenschutzerklaerung
            </Link>
            .
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
