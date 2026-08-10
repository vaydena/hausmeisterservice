import 'server-only';

import type { Metadata } from 'next';
import { legalConfig, formatAddress } from '@/lib/legal/config';

export const metadata: Metadata = {
  title: 'Datenschutzerklärung',
  description: 'Informationen zur Verarbeitung personenbezogener Daten nach DSGVO',
};

export default function DatenschutzPage() {
  const { company, contact, representative, dataProtectionOfficer, supervisoryAuthority, productName } = legalConfig;
  const sentryEnabled = Boolean(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN);

  return (
    <div className="legal-prose">
      <h1>Datenschutzerklärung</h1>

      <p>
        Diese Datenschutzerklärung erläutert Art, Umfang und Zweck der Verarbeitung von
        personenbezogenen Daten (im Folgenden „Daten") innerhalb der Anwendung {productName}.
        Grundlage für den Datenschutz ist die europäische Datenschutz-Grundverordnung (DSGVO)
        sowie das Bundesdatenschutzgesetz (BDSG).
      </p>

      <h2>1. Verantwortlicher</h2>
      <p>
        Verantwortlich für die Datenverarbeitung im Sinne des Art. 4 Nr. 7 DSGVO ist:
      </p>
      <p>
        {company.name}
        <br />
        {formatAddress()}
        <br />
        Vertreten durch: {representative}
        <br />
        E-Mail: <a href={`mailto:${contact.email}`}>{contact.email}</a>
        <br />
        Telefon: {contact.phone}
      </p>

      {dataProtectionOfficer ? (
        <>
          <h2>2. Datenschutzbeauftragte(r)</h2>
          <p>
            {dataProtectionOfficer.name}
            <br />
            E-Mail: <a href={`mailto:${dataProtectionOfficer.email}`}>{dataProtectionOfficer.email}</a>
          </p>
        </>
      ) : null}

      <h2>{dataProtectionOfficer ? '3' : '2'}. Zwecke und Rechtsgrundlagen der Verarbeitung</h2>
      <p>
        Wir verarbeiten personenbezogene Daten ausschließlich zu dem Zweck, den Betrieb der
        Software {productName} für unsere Kunden bereitzustellen. Die Verarbeitung erfolgt auf
        folgenden Rechtsgrundlagen:
      </p>
      <ul>
        <li>
          <strong>Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO)</strong> — Bereitstellung
          des Nutzerkontos, Verwaltung von Arbeitsaufträgen, Objekten, Mängelmeldungen,
          Zeiterfassung und Rechnungsstellung.
        </li>
        <li>
          <strong>Berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO)</strong> — technisch
          notwendige Verarbeitung (Session-Cookies, Fehler-Logs, Sicherheit gegen Missbrauch).
        </li>
        <li>
          <strong>Einwilligung (Art. 6 Abs. 1 lit. a DSGVO)</strong> — für optionale
          Standortdaten (GPS bei Zeiterfassung), Push-Benachrichtigungen und E-Mail-Kommunikation
          über die reine Vertragsabwicklung hinaus. Die Einwilligung kann jederzeit widerrufen werden.
        </li>
        <li>
          <strong>Rechtliche Verpflichtung (Art. 6 Abs. 1 lit. c DSGVO)</strong> — steuer-
          und handelsrechtliche Aufbewahrungspflichten für Rechnungsdaten (§147 AO, §257 HGB).
        </li>
      </ul>

      <h2>{dataProtectionOfficer ? '4' : '3'}. Kategorien verarbeiteter Daten</h2>
      <ul>
        <li>
          <strong>Stammdaten</strong> — Name, E-Mail-Adresse, Telefonnummer, Firmenzugehörigkeit,
          Rolle.
        </li>
        <li>
          <strong>Auftragsdaten</strong> — Arbeitsaufträge, Objekte, Wartungspläne,
          Mängelmeldungen, hochgeladene Dokumente und Fotos.
        </li>
        <li>
          <strong>Zeit- und Ortsdaten</strong> — Zeiterfassungs-Einträge; GPS-Koordinaten
          ausschließlich bei aktiver Einwilligung, mit einer Speicherdauer von maximal 90 Tagen.
        </li>
        <li>
          <strong>Kommunikationsdaten</strong> — interne Nachrichten, versendete E-Mails,
          Push-Abonnement-Endpunkte.
        </li>
        <li>
          <strong>Nutzungsdaten</strong> — Login-Zeitpunkte, Änderungsprotokolle (Audit-Log)
          zu sicherheitsrelevanten Aktionen.
        </li>
      </ul>
      <p>
        Vor dem Upload werden Foto-Metadaten (EXIF), insbesondere Standort- und
        Geräteinformationen, automatisch entfernt.
      </p>

      <h2>{dataProtectionOfficer ? '5' : '4'}. Empfänger und Auftragsverarbeiter</h2>
      <p>
        Wir setzen sorgfältig ausgewählte technische Dienstleister ein, die für uns
        personenbezogene Daten im Rahmen einer Auftragsverarbeitung nach Art. 28 DSGVO
        verarbeiten:
      </p>
      <ul>
        <li>
          <strong>Supabase Inc.</strong>, 970 Toa Payoh North #07-04, Singapore 318992 —
          Datenbank, Authentifizierung, Datei-Speicher. Die Verarbeitung erfolgt in einem
          Rechenzentrum innerhalb der Europäischen Union (Frankfurt am Main, Deutschland).
          Mit Supabase besteht ein Auftragsverarbeitungsvertrag (DPA) gemäß Art. 28 DSGVO.
          Datenschutzerklärung:{' '}
          <a href="https://supabase.com/privacy" target="_blank" rel="noreferrer">
            https://supabase.com/privacy
          </a>
          .
        </li>
        <li>
          <strong>Resend, Inc.</strong>, 2261 Market Street #5039, San Francisco, CA 94114, USA —
          Versand von Transaktions-E-Mails (Rechnungen, Angebote, Benachrichtigungen). Die
          Übermittlung in die USA erfolgt auf Basis der EU-Standardvertragsklauseln
          (Art. 46 Abs. 2 lit. c DSGVO). Mit Resend besteht ein Auftragsverarbeitungsvertrag.
          Datenschutzerklärung:{' '}
          <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noreferrer">
            https://resend.com/legal/privacy-policy
          </a>
          .
        </li>
        <li>
          <strong>Hostinger International Ltd.</strong>, 61 Lordou Vironos Street, 6023 Larnaca,
          Zypern — Hosting der Web-Anwendung. Mit Hostinger besteht ein
          Auftragsverarbeitungsvertrag. Datenschutzerklärung:{' '}
          <a href="https://www.hostinger.de/datenschutzrichtlinie" target="_blank" rel="noreferrer">
            https://www.hostinger.de/datenschutzrichtlinie
          </a>
          .
        </li>
        {sentryEnabled ? (
          <li>
            <strong>Functional Software, Inc. (Sentry)</strong>, 45 Fremont Street, 8th Floor,
            San Francisco, CA 94105, USA — Erfassung technischer Fehlermeldungen der Anwendung
            (Runtime-Error-Tracking) auf Grundlage unseres berechtigten Interesses am
            störungsfreien Betrieb der Plattform (Art. 6 Abs. 1 lit. f DSGVO). Die Übermittlung
            in die USA erfolgt auf Basis der EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c
            DSGVO). Wir haben Sentry so konfiguriert, dass IP-Adressen, User-Agents und Cookies
            der betroffenen Personen nicht mitgeschickt werden (Einstellung{' '}
            <code>sendDefaultPii: false</code>). Mit Sentry besteht ein
            Auftragsverarbeitungsvertrag. Datenschutzerklärung:{' '}
            <a href="https://sentry.io/privacy/" target="_blank" rel="noreferrer">
              https://sentry.io/privacy/
            </a>
            .
          </li>
        ) : null}
      </ul>
      <p>
        Eine Weitergabe an weitere Dritte findet nur statt, wenn wir rechtlich dazu verpflichtet
        sind (z. B. gegenüber Steuerbehörden oder Strafverfolgungsbehörden).
      </p>

      <h2>{dataProtectionOfficer ? '6' : '5'}. Speicherdauer</h2>
      <ul>
        <li>Konto- und Stammdaten: bis zur Löschung des Nutzerkontos.</li>
        <li>
          Rechnungs- und steuerrelevante Daten: 10 Jahre (§147 AO), Handelsbriefe 6 Jahre
          (§257 HGB).
        </li>
        <li>Audit-Log-Einträge: 2 Jahre.</li>
        <li>GPS-Standortdaten (opt-in): 90 Tage.</li>
        <li>Push-Abonnement-Endpunkte: bis zum Widerruf oder Abmeldung.</li>
        <li>Sonstige Betriebsdaten: für die Dauer der Vertragsbeziehung + 30 Tage Karenzzeit.</li>
      </ul>

      <h2>{dataProtectionOfficer ? '7' : '6'}. Ihre Rechte als betroffene Person</h2>
      <p>Sie haben nach der DSGVO folgende Rechte uns gegenüber:</p>
      <ul>
        <li>Recht auf Auskunft über die zu Ihrer Person gespeicherten Daten (Art. 15 DSGVO)</li>
        <li>Recht auf Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
        <li>Recht auf Löschung („Recht auf Vergessenwerden", Art. 17 DSGVO)</li>
        <li>Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
        <li>Recht auf Datenübertragbarkeit (Art. 20 DSGVO)</li>
        <li>
          Recht auf Widerspruch gegen die Verarbeitung, insbesondere bei berechtigtem Interesse
          (Art. 21 DSGVO)
        </li>
        <li>
          Recht auf Widerruf einer erteilten Einwilligung mit Wirkung für die Zukunft
          (Art. 7 Abs. 3 DSGVO)
        </li>
      </ul>
      <p>
        Zur Ausübung dieser Rechte wenden Sie sich bitte an{' '}
        <a href={`mailto:${contact.email}`}>{contact.email}</a>.
      </p>

      <h2>{dataProtectionOfficer ? '8' : '7'}. Beschwerderecht bei der Aufsichtsbehörde</h2>
      <p>
        Sie haben nach Art. 77 DSGVO das Recht, sich bei einer Aufsichtsbehörde zu beschweren.
        Zuständig ist:
      </p>
      <p>
        {supervisoryAuthority.name}
        <br />
        {supervisoryAuthority.address}
        <br />
        <a href={supervisoryAuthority.website} target="_blank" rel="noreferrer">
          {supervisoryAuthority.website}
        </a>
      </p>

      <h2>{dataProtectionOfficer ? '9' : '8'}. Cookies und lokale Speicherung</h2>
      <p>
        {productName} setzt ausschließlich technisch notwendige Cookies zur Aufrechterhaltung
        der Anmelde-Session ein. Diese Cookies sind für den Betrieb der Anwendung zwingend
        erforderlich; eine Einwilligung nach §25 Abs. 1 TTDSG ist nach §25 Abs. 2 Nr. 2 TTDSG
        nicht erforderlich.
      </p>
      <p>
        Weiterhin verwendet die Anwendung <em>Local Storage</em> und <em>IndexedDB</em>, um
        Bedienelemente-Einstellungen und Offline-Warteschlangen (z. B. für Zeiterfassung ohne
        Internetverbindung) im Browser zu speichern. Es findet keine Übertragung dieser Daten
        an Dritte statt.
      </p>

      <h2>{dataProtectionOfficer ? '10' : '9'}. Push-Benachrichtigungen</h2>
      <p>
        Nach Aktivierung durch den Nutzer sendet die Anwendung Push-Benachrichtigungen über den
        Push-Dienst des jeweiligen Browsers (Web Push mit VAPID). Dabei wird ein
        pseudonymisierter Endpunkt gespeichert. Nutzer können Push-Benachrichtigungen jederzeit
        über die Einstellungen der Anwendung oder ihres Browsers deaktivieren.
      </p>

      <h2>{dataProtectionOfficer ? '11' : '10'}. Datensicherheit</h2>
      <p>
        Wir setzen technische und organisatorische Maßnahmen ein, um Ihre Daten gegen Verlust,
        unberechtigten Zugriff und Manipulation zu schützen. Dazu gehören insbesondere:
        Transportverschlüsselung (TLS) für alle Verbindungen, Row-Level-Security zur
        Mandanten-Trennung in der Datenbank, verschlüsselte Backups sowie Rollen- und
        Rechteverwaltung mit dem Prinzip minimaler Berechtigungen.
      </p>

      <h2>{dataProtectionOfficer ? '12' : '11'}. Änderungen dieser Datenschutzerklärung</h2>
      <p>
        Wir behalten uns vor, diese Datenschutzerklärung anzupassen, wenn dies aufgrund
        gesetzlicher Änderungen oder Änderungen unserer Leistungen erforderlich wird. Über
        wesentliche Änderungen werden aktive Nutzer per E-Mail informiert.
      </p>
    </div>
  );
}
