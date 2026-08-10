import type { Metadata } from 'next';
import { legalConfig } from '@/lib/legal/config';

export const metadata: Metadata = {
  title: 'Allgemeine Geschäftsbedingungen',
  description: 'AGB für die Nutzung der Software',
};

export default function AgbPage() {
  const { company, productName, jurisdiction } = legalConfig;

  return (
    <div className="legal-prose">
      <h1>Allgemeine Geschäftsbedingungen (AGB)</h1>

      <h2>§1 Geltungsbereich</h2>
      <p>
        (1) Diese Allgemeinen Geschäftsbedingungen (nachfolgend „AGB") gelten für alle
        Verträge zwischen {company.name} (nachfolgend „Anbieter") und dem jeweiligen Kunden
        (nachfolgend „Kunde") über die Nutzung der Software {productName} als
        Software-as-a-Service (SaaS).
      </p>
      <p>
        (2) Der Kunde ist Unternehmer im Sinne des §14 BGB, es sei denn, es wird ausdrücklich
        etwas anderes vereinbart. Handelt es sich bei dem Kunden um einen Verbraucher, gelten
        die einschlägigen Verbraucherschutzvorschriften vorrangig.
      </p>
      <p>
        (3) Abweichende, entgegenstehende oder ergänzende Allgemeine Geschäftsbedingungen des
        Kunden werden nur dann Vertragsbestandteil, wenn der Anbieter ihrer Geltung
        ausdrücklich schriftlich zugestimmt hat.
      </p>

      <h2>§2 Vertragsgegenstand</h2>
      <p>
        (1) Gegenstand des Vertrages ist die Bereitstellung der Software {productName} über
        das Internet zur Nutzung durch den Kunden und die von ihm eingerichteten Nutzer.
      </p>
      <p>
        (2) Die Software dient der Verwaltung von Objekten, Arbeitsaufträgen, Mängelmeldungen,
        Zeiterfassung, Rechnungsstellung und weiteren Funktionen aus dem Bereich
        Hausmeister- und Objektservice. Der genaue Funktionsumfang ergibt sich aus der
        jeweils aktuellen Leistungsbeschreibung.
      </p>
      <p>
        (3) Der Anbieter ist berechtigt, den Funktionsumfang zu erweitern oder anzupassen,
        soweit dies aufgrund technischer Weiterentwicklung sinnvoll ist und die vertraglich
        geschuldeten Kernfunktionen nicht wesentlich eingeschränkt werden.
      </p>

      <h2>§3 Vertragsschluss</h2>
      <p>
        (1) Der Vertrag kommt durch Registrierung des Kunden auf der Plattform und
        Bestätigung durch den Anbieter zustande.
      </p>
      <p>
        (2) Vor Abschluss eines kostenpflichtigen Tarifs erhält der Kunde eine Übersicht der
        gewählten Leistungen und Preise. Mit Bestätigung dieser Übersicht bestellt der Kunde
        kostenpflichtig.
      </p>

      <h2>§4 Leistungen des Anbieters</h2>
      <p>
        (1) Der Anbieter stellt dem Kunden die Software für die Dauer des Vertrages am Router-Ausgang
        des vom Anbieter genutzten Rechenzentrums (Übergabepunkt) zur Nutzung bereit.
      </p>
      <p>
        (2) Der Anbieter stellt Speicherplatz auf Servern zur Speicherung der Daten des Kunden
        zur Verfügung. Der Umfang des Speicherplatzes ergibt sich aus dem jeweils gewählten Tarif.
      </p>
      <p>
        (3) Der Anbieter sorgt für regelmäßige Sicherungen der Kundendaten. Der Kunde bleibt für
        die Sicherung eigener Datenbestände jedoch selbst verantwortlich.
      </p>

      <h2>§5 Verfügbarkeit</h2>
      <p>
        (1) Der Anbieter gewährleistet eine Verfügbarkeit der Software von 98,5 % im Jahresmittel.
        Ausgenommen sind Zeiten, in denen die Software aufgrund von technischen oder sonstigen
        Problemen, die nicht im Einflussbereich des Anbieters liegen (höhere Gewalt, Verschulden
        Dritter etc.), nicht erreichbar ist, sowie geplante Wartungsfenster.
      </p>
      <p>
        (2) Geplante Wartungsarbeiten werden nach Möglichkeit außerhalb der üblichen
        Geschäftszeiten durchgeführt und dem Kunden mit angemessener Vorlaufzeit angekündigt.
      </p>

      <h2>§6 Nutzungsrechte und Pflichten des Kunden</h2>
      <p>
        (1) Der Anbieter räumt dem Kunden für die Vertragslaufzeit ein nicht ausschließliches,
        nicht übertragbares Recht ein, die Software vertragsgemäß zu nutzen.
      </p>
      <p>
        (2) Der Kunde ist verpflichtet, Zugangsdaten geheim zu halten und vor unberechtigtem
        Zugriff Dritter zu schützen. Er trägt die Verantwortung für alle Aktivitäten, die unter
        seinen Zugangsdaten erfolgen.
      </p>
      <p>
        (3) Der Kunde ist für die von ihm eingestellten Inhalte selbst verantwortlich. Er
        versichert, dass die von ihm hochgeladenen Daten frei von Rechten Dritter sind und
        nicht gegen geltendes Recht verstoßen.
      </p>
      <p>
        (4) Der Kunde darf die Software nicht für rechts- oder sittenwidrige Zwecke einsetzen,
        insbesondere nicht zur Verbreitung von rechtswidrigen, jugendgefährdenden oder
        diskriminierenden Inhalten.
      </p>

      <h2>§7 Vergütung und Zahlungsbedingungen</h2>
      <p>
        (1) Die Höhe der vom Kunden zu zahlenden Vergütung ergibt sich aus dem jeweils
        gewählten Tarif. Die genannten Preise sind Nettopreise zuzüglich der jeweils gesetzlich
        geltenden Umsatzsteuer.
      </p>
      <p>
        (2) Die Vergütung wird monatlich im Voraus in Rechnung gestellt und ist nach Rechnungsstellung
        sofort ohne Abzug zur Zahlung fällig.
      </p>
      <p>
        (3) Bei Zahlungsverzug ist der Anbieter berechtigt, den Zugang zur Software nach vorheriger
        Ankündigung mit angemessener Frist zu sperren. Der Zahlungsanspruch bleibt hiervon
        unberührt.
      </p>

      <h2>§8 Datenschutz und Auftragsverarbeitung</h2>
      <p>
        (1) Der Anbieter verarbeitet personenbezogene Daten im Rahmen der Vertragserfüllung
        gemäß seiner Datenschutzerklärung.
      </p>
      <p>
        (2) Soweit der Kunde im Rahmen der Nutzung der Software personenbezogene Daten Dritter
        (z. B. seiner Mitarbeitenden oder Bewohner) verarbeitet, ist er Verantwortlicher im
        Sinne der DSGVO. Der Anbieter agiert insoweit als Auftragsverarbeiter (Art. 28 DSGVO).
        Ein entsprechender Auftragsverarbeitungsvertrag wird mit Vertragsschluss angeboten und
        ist zwingend abzuschließen.
      </p>

      <h2>§9 Haftung</h2>
      <p>
        (1) Der Anbieter haftet nach den gesetzlichen Bestimmungen für Schäden aus der
        Verletzung des Lebens, des Körpers oder der Gesundheit, die auf einer fahrlässigen
        oder vorsätzlichen Pflichtverletzung des Anbieters, seiner gesetzlichen Vertreter oder
        Erfüllungsgehilfen beruhen.
      </p>
      <p>
        (2) Für sonstige Schäden haftet der Anbieter nur bei Vorsatz und grober Fahrlässigkeit
        sowie bei Verletzung einer wesentlichen Vertragspflicht (Kardinalpflicht). Die Haftung
        für die Verletzung von Kardinalpflichten ist der Höhe nach auf den vertragstypischen,
        vorhersehbaren Schaden begrenzt.
      </p>
      <p>
        (3) Die Haftung nach dem Produkthaftungsgesetz sowie die Haftung aus einer vom Anbieter
        übernommenen Garantie bleibt unberührt.
      </p>

      <h2>§10 Vertragslaufzeit und Kündigung</h2>
      <p>
        (1) Der Vertrag beginnt mit der Freischaltung des Zugangs und läuft auf unbestimmte Zeit.
      </p>
      <p>
        (2) Der Vertrag kann von beiden Parteien mit einer Frist von einem Monat zum Ende eines
        Abrechnungsmonats gekündigt werden.
      </p>
      <p>
        (3) Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.
        Ein wichtiger Grund liegt für den Anbieter insbesondere vor bei erheblicher Verletzung
        der vertraglichen Pflichten durch den Kunden, insbesondere bei Zahlungsverzug von mehr
        als zwei Monatsraten.
      </p>
      <p>
        (4) Kündigungen bedürfen der Textform (§126b BGB).
      </p>
      <p>
        (5) Nach Vertragsende hat der Kunde die Möglichkeit, seine Daten für 30 Tage in einem
        gängigen Format zu exportieren. Danach werden die Daten unwiderruflich gelöscht, soweit
        keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
      </p>

      <h2>§11 Änderungen der AGB</h2>
      <p>
        Der Anbieter behält sich vor, diese AGB anzupassen, soweit dies aufgrund geänderter
        rechtlicher Rahmenbedingungen oder aufgrund einer Weiterentwicklung der Software
        erforderlich ist. Änderungen werden dem Kunden mindestens sechs Wochen vor Inkrafttreten
        in Textform angekündigt. Widerspricht der Kunde nicht innerhalb von sechs Wochen nach
        Zugang der Änderungsmitteilung, gelten die Änderungen als genehmigt. Auf diese Folge wird
        der Anbieter in der Änderungsmitteilung gesondert hinweisen.
      </p>

      <h2>§12 Schlussbestimmungen</h2>
      <p>
        (1) Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des
        UN-Kaufrechts. Bei Verbrauchern gilt diese Rechtswahl nur insoweit, als nicht der
        gewährte Schutz durch zwingende Bestimmungen des Rechts des Staates, in dem der
        Verbraucher seinen gewöhnlichen Aufenthalt hat, entzogen wird.
      </p>
      <p>
        (2) Ausschließlicher Gerichtsstand für alle Streitigkeiten aus oder im Zusammenhang
        mit diesem Vertrag ist – soweit gesetzlich zulässig – {jurisdiction}.
      </p>
      <p>
        (3) Sollten einzelne Bestimmungen dieser AGB ganz oder teilweise unwirksam sein oder
        werden, so wird die Wirksamkeit der übrigen Bestimmungen hiervon nicht berührt. An die
        Stelle der unwirksamen Bestimmung tritt die gesetzliche Regelung.
      </p>
    </div>
  );
}
