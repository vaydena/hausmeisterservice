import type { Metadata } from 'next';
import { Archivo, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './_landing/landing.css';
import { LANDING_HTML } from './_landing/markup';

/**
 * Oeffentliche Startseite (/).
 *
 * Reine Marketing-Seite fuer NICHT angemeldete Besucher: der Proxy schickt
 * eingeloggte Sessions von '/' sofort ins /dashboard (STAFF_PUBLIC_ROUTES),
 * hier gibt es also bewusst keine auth-abhaengigen Inhalte.
 *
 * Das Markup ist statisches, selbst erzeugtes HTML (kein Nutzer-Input) und
 * wird als Ganzes gerendert — so bleibt die im Artifact freigegebene, visuell
 * gepruefte Landingpage 1:1 erhalten, ohne hunderte Inline-Styles/SVGs von
 * Hand nach JSX zu uebertragen. Alle CSS-Regeln sind auf `.lp` gescopt
 * (siehe _landing/landing.css), damit nichts in den Rest der App durchsickert.
 * Schriften kommen selbst-gehostet aus next/font (kein Google-Aufruf → DSGVO).
 *
 * SEO: keyword-optimierter Title/Description (Hausmeistersoftware,
 * Hausmeisterservice, Gebaeudedienste), Canonical, Open-Graph/Twitter und
 * strukturierte Daten (JSON-LD: Organization + WebSite + SoftwareApplication).
 */

const SITE_URL = 'https://hausmeisterservice.vaydena.de';

const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
});
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex',
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    // absolute → ohne den "· Hausmeisterservice"-Zusatz des Root-Layouts,
    // damit der Title exakt (und keyword-fuehrend) unter ~60 Zeichen bleibt.
    absolute: 'Hausmeistersoftware für Hausmeisterservice & Gebäudedienste',
  },
  description:
    'Die Hausmeistersoftware für Ihren Hausmeisterservice: Objekte, Aufträge, Zeiterfassung, Wartung & Abrechnung in einer App. 14 Tage kostenlos testen – ohne Kreditkarte.',
  keywords: [
    'Hausmeistersoftware',
    'Hausmeisterservice',
    'Hausmeisterservice Software',
    'Hausmeister Software',
    'Hausmeister App',
    'Gebäudedienst Software',
    'Facility Management Software',
    'Objektverwaltung Software',
    'Hausverwaltung Software',
    'Zeiterfassung Hausmeister',
    'Wartungssoftware',
    'Auftragsverwaltung Handwerk',
  ],
  applicationName: 'Hausmeisterservice',
  authors: [{ name: 'Hausmeisterservice' }],
  category: 'Business Software',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    url: '/',
    siteName: 'Hausmeisterservice',
    title: 'Hausmeistersoftware für Hausmeister- & Gebäudedienste',
    description:
      'Objekte, Aufträge, Einsätze und Abrechnung in einer App – die komplette Hausmeistersoftware. 14 Tage kostenlos testen, ohne Kreditkarte.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Hausmeistersoftware für Hausmeister- & Gebäudedienste',
    description:
      'Die komplette Software für Hausmeister- & Gebäudedienste: Objekte, Aufträge, Zeiterfassung & Abrechnung. 14 Tage kostenlos testen.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

// Marketing-Seite ohne dynamische Daten: statisch mit stuendlicher Revalidierung.
export const revalidate = 3600;

// Strukturierte Daten fuer Suchmaschinen (Schema.org / JSON-LD).
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Hausmeisterservice',
      url: SITE_URL,
      email: 'kontakt@vaydena.de',
      description:
        'Anbieter der Hausmeistersoftware „Hausmeisterservice" für Hausmeister- und Gebäudedienste.',
      areaServed: 'DE',
      address: { '@type': 'PostalAddress', addressCountry: 'DE' },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'Hausmeisterservice',
      description: 'Hausmeistersoftware für Hausmeister- und Gebäudedienste.',
      inLanguage: 'de-DE',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#software`,
      name: 'Hausmeisterservice',
      alternateName: 'Hausmeistersoftware',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Facility-Management- & Hausmeistersoftware',
      operatingSystem: 'Web (Browser), iOS, Android',
      inLanguage: 'de-DE',
      url: SITE_URL,
      description:
        'Die komplette Hausmeistersoftware für Hausmeister- und Gebäudedienste: Objekte, Aufträge, Zeiterfassung, Wartung, Kommunikation und Abrechnung in einer App.',
      offers: {
        '@type': 'Offer',
        category: 'Subscription',
        priceCurrency: 'EUR',
        description:
          '14 Tage kostenlos testen, danach im Monats- oder Jahresabo. Zahlung per Überweisung (GiroCode) oder PayPal.',
      },
      featureList: [
        'Objekt- und Liegenschaftsverwaltung',
        'Auftrags- und Mängelmanagement',
        'Wartungsplanung und Instandhaltung',
        'Mobile Zeiterfassung',
        'Einsatz-, Schicht- und Tourenplanung',
        'Material- und Fuhrparkverwaltung',
        'Rechnungen und Reporting',
        'Benutzer und Rollen (DSGVO-konform)',
        'Automatisierungen',
        'Bewohner- und Eigentümer-Portal',
      ],
      provider: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};

export default function LandingPage() {
  const html = LANDING_HTML.replace('{{YEAR}}', String(new Date().getFullYear()));

  return (
    <>
      <script
        type="application/ld+json"
        // Eigene, statische Schema.org-Daten (kein Fremd-/Nutzerinput).
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div
        className={`lp ${archivo.variable} ${plexSans.variable} ${plexMono.variable}`}
        // Statisches, vertrauenswuerdiges Markup (keine Fremd-/Nutzerdaten) —
        // siehe Datei-Kommentar oben.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
