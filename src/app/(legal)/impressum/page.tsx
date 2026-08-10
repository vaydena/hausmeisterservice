import type { Metadata } from 'next';
import { legalConfig } from '@/lib/legal/config';

export const metadata: Metadata = {
  title: 'Impressum',
  description: 'Anbieterkennzeichnung nach §5 TMG',
};

export default function ImpressumPage() {
  const { company, address, contact, representative, commercialRegister, vatId, editorialResponsible } = legalConfig;
  const companyLine = company.tradeName
    ? `${company.name} (${company.tradeName})`
    : company.name;

  return (
    <div className="legal-prose">
      <h1>Impressum</h1>

      <h2>Angaben gemäß §5 TMG</h2>
      <p>
        {companyLine}
        {company.legalForm ? <> · {company.legalForm}</> : null}
        <br />
        {address.street}
        <br />
        {address.zip} {address.city}
        <br />
        {address.country}
      </p>

      <h2>Vertreten durch</h2>
      <p>{representative}</p>

      <h2>Kontakt</h2>
      <p>
        Telefon: {contact.phone}
        <br />
        E-Mail: <a href={`mailto:${contact.email}`}>{contact.email}</a>
      </p>

      {commercialRegister ? (
        <>
          <h2>Handelsregister</h2>
          <p>
            Registergericht: {commercialRegister.court}
            <br />
            Registernummer: {commercialRegister.number}
          </p>
        </>
      ) : null}

      {vatId ? (
        <>
          <h2>Umsatzsteuer-ID</h2>
          <p>
            Umsatzsteuer-Identifikationsnummer gemäß §27a Umsatzsteuergesetz:
            <br />
            {vatId}
          </p>
        </>
      ) : null}

      {editorialResponsible ? (
        <>
          <h2>Redaktionell verantwortlich</h2>
          <p>{editorialResponsible}</p>
        </>
      ) : null}

      <h2>Streitschlichtung</h2>
      <p>
        Die Europäische Kommission stellt eine Plattform zur
        Online-Streitbeilegung (OS) bereit:{' '}
        <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noreferrer">
          https://ec.europa.eu/consumers/odr/
        </a>
        .
        <br />
        Unsere E-Mail-Adresse finden Sie oben im Impressum.
      </p>
      <p>
        Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </p>

      <h2>Haftung für Inhalte</h2>
      <p>
        Als Diensteanbieter sind wir gemäß §7 Abs. 1 TMG für eigene Inhalte auf diesen Seiten
        nach den allgemeinen Gesetzen verantwortlich. Nach §§8 bis 10 TMG sind wir als
        Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde
        Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige
        Tätigkeit hinweisen.
      </p>
      <p>
        Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den
        allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist jedoch
        erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei
        Bekanntwerden entsprechender Rechtsverletzungen werden wir diese Inhalte umgehend entfernen.
      </p>

      <h2>Haftung für Links</h2>
      <p>
        Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen
        Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen.
        Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber
        der Seiten verantwortlich.
      </p>

      <h2>Urheberrecht</h2>
      <p>
        Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen
        dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art
        der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen
        Zustimmung des jeweiligen Autors bzw. Erstellers.
      </p>
    </div>
  );
}
