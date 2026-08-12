/**
 * Absender-Daten für Plattform-Rechnungen (Vaydena → Agentur).
 *
 * Keine Env-Vars nötig — die Angaben stehen ohnehin öffentlich im Impressum
 * und auf jeder ausgestellten Rechnung. Änderungen sollten hier und in
 * `src/lib/legal/config.ts` gleichzeitig gemacht werden.
 *
 * Kleinunternehmer nach § 19 UStG — keine USt.-Ausweisung.
 */
export const PLATFORM_INVOICE_SENDER = {
  name: 'Vaydena Hausmeisterservice',
  legalRepresentative: 'Karl-Heinz Bicker',
  street: 'Biberstraße 27',
  zip: '85354',
  city: 'Freising',
  phone: '0151-24012554',
  email: 'info@vaydena.de',
  taxNote: 'Kleinunternehmer nach § 19 UStG — keine Umsatzsteuer ausgewiesen.',
  taxId: null as string | null, // Steuernummer wird nachgereicht
} as const;
