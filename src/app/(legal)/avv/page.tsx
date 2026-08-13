import 'server-only';

import type { Metadata } from 'next';
import { legalConfig, formatAddress } from '@/lib/legal/config';

export const metadata: Metadata = {
  title: 'Auftragsverarbeitungsvertrag (AVV)',
  description:
    'Muster-Auftragsverarbeitungsvertrag nach Art. 28 DSGVO für Firmenkunden der Hausmeisterservice',
};

export default function AvvPage() {
  const { company, contact, productName } = legalConfig;
  const subject = `AVV-Anfrage — [Ihr Firmenname]`;
  const body =
    `Guten Tag,\n\n` +
    `wir möchten einen Auftragsverarbeitungsvertrag nach Art. 28 DSGVO für die Nutzung ` +
    `von ${productName} abschließen.\n\n` +
    `Unser Firmen-Account:\n` +
    `— Firmenname:\n` +
    `— Rechtsform:\n` +
    `— Anschrift:\n` +
    `— Ansprechpartner:in Datenschutz:\n` +
    `— E-Mail für den unterzeichneten Vertrag:\n\n` +
    `Vielen Dank.\n`;

  const mailto = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div className="legal-prose">
      <h1>Auftragsverarbeitungsvertrag (AVV) nach Art. 28 DSGVO</h1>

      <p>
        Diese Seite richtet sich an Firmenkunden von {productName} — also Hausmeister-,
        Facility- und Verwaltungsbetriebe, die die App nutzen, um Daten ihrer Mitarbeiter,
        Bewohner, Eigentümer, Auftraggeber und Objekte zu verwalten. Für die Verarbeitung
        dieser personenbezogenen Daten sind Sie datenschutzrechtlich Verantwortlicher,
        {' '}{company.name} ist Auftragsverarbeiter im Sinne des Art. 28 DSGVO.
      </p>

      <h2>1. Wann brauchen Sie einen AVV mit uns?</h2>
      <p>
        Sobald Sie personenbezogene Daten Dritter (Beschäftigte, Bewohner, Eigentümer,
        Handwerker etc.) in {productName} speichern, sind Sie nach Art. 28 DSGVO
        verpflichtet, mit uns als Auftragsverarbeiter einen schriftlichen (oder
        elektronischen) Auftragsverarbeitungsvertrag abzuschließen. Der reine Nutzungsvertrag
        über unsere Allgemeinen Geschäftsbedingungen genügt dafür nicht.
      </p>
      <p>
        <strong>Kein AVV nötig ist</strong>, wenn Sie ausschließlich Ihre eigenen
        Firmendaten (Firmenname, Bankverbindung, Rechnungsadresse) in der App speichern
        und keine Daten anderer natürlicher Personen — das ist in der Praxis aber selten.
      </p>

      <h2>2. Was Sie tun müssen — Ablauf</h2>
      <ol>
        <li>
          Sie fordern die Vertragsvorlage bei uns an — am schnellsten mit dem unten
          verlinkten E-Mail-Entwurf.
        </li>
        <li>
          Wir senden Ihnen die AVV-Vorlage per E-Mail innerhalb eines Werktags zu (PDF und
          Textform).
        </li>
        <li>
          Sie füllen die Kopfdaten aus (Firma, Anschrift, Vertreter, ggf.
          Datenschutzbeauftragter), unterschreiben elektronisch oder handschriftlich und
          senden das Dokument zurück.
        </li>
        <li>
          Wir gegenzeichnen und senden Ihnen die beidseitig unterschriebene Fassung zurück.
          Ab diesem Zeitpunkt ist der AVV wirksam — er wirkt jedoch rückwirkend auf den
          Beginn der Nutzung, damit auch die Testphase abgedeckt ist.
        </li>
      </ol>

      <p>
        <a
          href={mailto}
          className="inline-flex items-center rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] no-underline hover:opacity-90"
        >
          AVV per E-Mail anfordern →
        </a>
      </p>

      <h2>3. Was im AVV geregelt ist</h2>
      <p>
        Unsere Vorlage entspricht den Mindestanforderungen des Art. 28 Abs. 3 DSGVO und
        regelt insbesondere:
      </p>
      <ul>
        <li>Gegenstand und Dauer der Verarbeitung</li>
        <li>Art und Zweck der Verarbeitung, Art der personenbezogenen Daten, Kategorien betroffener Personen</li>
        <li>Rechte und Pflichten des Verantwortlichen (Sie) und des Auftragsverarbeiters (wir)</li>
        <li>Weisungsrechte, Weisungsbefolgung, Widerspruch bei unrechtmäßigen Weisungen</li>
        <li>Vertraulichkeitsverpflichtung unserer Beschäftigten (Art. 28 Abs. 3 lit. b DSGVO)</li>
        <li>Technische und organisatorische Maßnahmen (TOMs) — Anlage 1 des AVV</li>
        <li>Genehmigung und Auflistung der Unter-Auftragsverarbeiter (siehe Ziffer 4)</li>
        <li>Unterstützung bei Betroffenenrechten und Meldepflichten nach Art. 32-36 DSGVO</li>
        <li>Löschung/Rückgabe der Daten nach Vertragsende</li>
        <li>Prüfungs- und Kontrollrechte des Verantwortlichen</li>
      </ul>

      <h2>4. Genehmigte Unter-Auftragsverarbeiter</h2>
      <p>
        Wir setzen zur Erbringung der Leistung die folgenden Unter-Auftragsverarbeiter ein.
        Mit Abschluss des AVV mit uns stimmen Sie deren Einsatz allgemein zu (Art. 28 Abs.
        2 Satz 2 DSGVO). Vor jeder Änderung informieren wir Sie mit einer Frist von 30
        Tagen; in dieser Zeit können Sie widersprechen.
      </p>
      <table>
        <thead>
          <tr>
            <th>Anbieter</th>
            <th>Zweck</th>
            <th>Standort der Verarbeitung</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Supabase Inc.</td>
            <td>Datenbank, Auth, Datei-Speicher</td>
            <td>EU (Frankfurt am Main, Deutschland)</td>
          </tr>
          <tr>
            <td>Hostinger International Ltd.</td>
            <td>Hosting der Web-Anwendung</td>
            <td>EU</td>
          </tr>
          <tr>
            <td>Resend, Inc.</td>
            <td>Versand von Transaktions-E-Mails (Rechnungen, Angebote, Benachrichtigungen)</td>
            <td>USA (EU-Standardvertragsklauseln)</td>
          </tr>
          <tr>
            <td>Functional Software, Inc. (Sentry)</td>
            <td>Erfassung technischer Fehlermeldungen (nur bei aktivem Sentry-Setup)</td>
            <td>USA (EU-Standardvertragsklauseln)</td>
          </tr>
        </tbody>
      </table>

      <h2>5. Technische und organisatorische Maßnahmen (TOMs)</h2>
      <p>
        Zusammenfassung — die verbindliche Ausfertigung ist Anlage 1 des AVV:
      </p>
      <ul>
        <li>
          <strong>Zutritts- und Zugangskontrolle</strong>: Rechenzentren der Unter-Auftragsverarbeiter
          mit ISO-27001-Zertifizierung, Zugriff auf Produktionsdaten nur über personalisierte
          Accounts mit Zwei-Faktor-Authentifizierung.
        </li>
        <li>
          <strong>Zugriffskontrolle in der App</strong>: rollenbasiertes Berechtigungssystem
          (RBAC) mit Prinzip minimaler Berechtigungen; Mandanten-Trennung erzwungen durch
          Row-Level-Security auf Datenbank-Ebene.
        </li>
        <li>
          <strong>Transportverschlüsselung</strong>: alle Verbindungen HTTPS/TLS 1.2+; HSTS
          aktiv; sichere Cookie-Flags.
        </li>
        <li>
          <strong>Speicherverschlüsselung</strong>: Datenbank at-rest verschlüsselt; Backups
          verschlüsselt.
        </li>
        <li>
          <strong>Protokollierung</strong>: Änderungs- und Zugriffsprotokolle
          (Audit-Log) auf sensiblen Objekten, mit Aufbewahrung von 2 Jahren.
        </li>
        <li>
          <strong>Datenminimierung</strong>: EXIF-Standort-Metadaten werden vor dem
          Foto-Upload automatisch entfernt; GPS-Standort nur bei aktiver Einwilligung mit
          90-Tage-Löschfrist.
        </li>
        <li>
          <strong>Backup und Wiederherstellung</strong>: tägliche Backups über den
          Cloud-Anbieter; Point-in-Time-Recovery innerhalb der letzten 7 Tage.
        </li>
        <li>
          <strong>Trennungskontrolle</strong>: strikte Multi-Tenant-Trennung über
          <code>tenant_id</code>-Foreign-Keys und Row-Level-Security-Richtlinien; separate
          Datenbanken zwischen Test- und Produktionsumgebung.
        </li>
        <li>
          <strong>Meldeprozess bei Datenpannen</strong>: Meldung an Sie als Verantwortlichen
          innerhalb von 24 Stunden nach Bekanntwerden, damit Sie die 72-Stunden-Frist nach
          Art. 33 DSGVO gegenüber Ihrer Aufsichtsbehörde einhalten können.
        </li>
      </ul>

      <h2>6. Kontakt und Ansprechpartner</h2>
      <p>
        {company.name}
        <br />
        {formatAddress()}
        <br />
        E-Mail: <a href={`mailto:${contact.email}`}>{contact.email}</a>
        <br />
        Telefon: {contact.phone}
      </p>
      <p>
        Für alle Fragen rund um Auftragsverarbeitung, TOMs oder eine Datenpanne wenden Sie
        sich bitte per E-Mail mit dem Betreff „Datenschutz Auftragsverarbeitung" an die
        oben genannte Adresse. Wir antworten innerhalb eines Werktags.
      </p>

      <p>
        Weitere Informationen finden Sie in unserer{' '}
        <a href="/datenschutz">Datenschutzerklärung</a>.
      </p>
    </div>
  );
}
