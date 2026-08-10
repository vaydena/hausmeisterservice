/**
 * Zentrale Konfiguration für Impressum, Datenschutzerklärung und AGB.
 *
 * Vor Live-Betrieb:
 *   1. Alle mit "{PLATZHALTER}" markierten Felder ausfüllen.
 *   2. Rechtsbeistand die fertigen Seiten prüfen lassen — die Vorlagen
 *      sind sorgfältig strukturiert, ersetzen aber keine anwaltliche
 *      Prüfung im Einzelfall.
 *   3. Auftragsverarbeitungsvertrag (AVV) mit Supabase abschließen
 *      (unter https://supabase.com/legal/dpa) — verweist auf DPA im
 *      Datenschutzerklärungs-Text.
 *   4. Falls Resend als E-Mail-Provider aktiv: AVV mit Resend
 *      abschließen (unter https://resend.com/legal/dpa).
 */

export const legalConfig = {
  company: {
    /** Firmenname wie im Handelsregister (bzw. Einzelunternehmen). */
    name: 'Karl-Heinz Bicker',
    /** Optional: abweichender Handelsname / Marke. */
    tradeName: null as string | null,
    /** Rechtsform, z. B. "GmbH", "UG (haftungsbeschränkt)", "Einzelunternehmen". */
    legalForm: 'Einzelunternehmen',
  },
  address: {
    street: 'Biberstraße 27',
    zip: '85354',
    city: 'Freising',
    country: 'Deutschland',
  },
  contact: {
    email: 'info@vaydena.de',
    phone: '0151 24012554',
  },
  /**
   * Vertretungsberechtigte Person(en) — bei GmbH die Geschäftsführung,
   * bei Einzelunternehmen der Inhaber.
   */
  representative: 'Karl-Heinz Bicker',
  /**
   * Handelsregister-Angaben. Bei Einzelunternehmen ohne HR-Eintrag
   * einfach auf `null` setzen — die Sektion entfällt dann automatisch.
   */
  commercialRegister: null as { court: string; number: string } | null,
  /**
   * Umsatzsteuer-Identifikationsnummer nach §27a UStG. Bei
   * Kleinunternehmen ohne USt-IdNr auf `null` setzen.
   */
  vatId: null as string | null,
  /**
   * Verantwortlicher iSv §18 MStV (Medienstaatsvertrag) — nur nötig,
   * wenn die App journalistisch-redaktionelle Inhalte veröffentlicht
   * (z. B. Blog-Sektion). Bei reiner SaaS-App auf `null` setzen.
   */
  editorialResponsible: null as string | null,
  /**
   * Datenschutzbeauftragte(r) — nur Pflicht bei >20 Beschäftigten
   * regelmäßig mit Verarbeitung personenbezogener Daten befasst.
   * Bei kleinen Teams auf `null` setzen.
   */
  dataProtectionOfficer: null as {
    name: string;
    email: string;
  } | null,
  /**
   * Zuständige Datenschutz-Aufsichtsbehörde für Beschwerden nach
   * Art. 77 DSGVO. Standard: Landesbeauftragter des Bundeslandes,
   * in dem die Firma sitzt. Muster für Bayern eingetragen — bitte
   * für den eigenen Standort anpassen.
   */
  supervisoryAuthority: {
    name: 'Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)',
    address: 'Promenade 18, 91522 Ansbach',
    website: 'https://www.lda.bayern.de',
  },
  /**
   * Gerichtsstand für die AGB. Regel: Wohnsitz/Sitz der Firma.
   * Bei B2B-Geschäften ist Gerichtsstands­vereinbarung wirksam;
   * bei B2C-Geschäften greift zwingend §12/13 EGZPO.
   */
  jurisdiction: 'Freising',
  /**
   * Zeitpunkt der letzten Aktualisierung — wird auf den Seiten
   * angezeigt und muss bei inhaltlichen Änderungen aktualisiert werden.
   */
  lastUpdated: '10.08.2026',
  /**
   * Produktname für die AGB — wird in Vertragsgegenstand-Klauseln
   * verwendet.
   */
  productName: 'Hausmeister App',
} as const;

/**
 * Convenience: Postanschrift als String für Kontaktangaben.
 */
export function formatAddress(): string {
  const { street, zip, city, country } = legalConfig.address;
  return `${street}, ${zip} ${city}, ${country}`;
}
