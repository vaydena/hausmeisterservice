import 'server-only';
import { serverEnv } from '@/lib/env';

export interface BankDetails {
  holder: string;
  iban: string;
  bic: string;
}

/**
 * Liefert die Bankverbindung des Plattform-Betreibers, oder null wenn die
 * Env-Vars nicht gesetzt sind. Rufer sollten den null-Fall behandeln (UI
 * blendet das Überweisungs-Panel dann aus mit Hinweis).
 */
export function getBankDetails(): BankDetails | null {
  const env = serverEnv();
  if (!env.PAYMENT_BANK_HOLDER || !env.PAYMENT_BANK_IBAN || !env.PAYMENT_BANK_BIC) return null;
  return {
    holder: env.PAYMENT_BANK_HOLDER,
    iban: env.PAYMENT_BANK_IBAN,
    bic: env.PAYMENT_BANK_BIC,
  };
}

/**
 * Verwendungszweck aus Rechnungsnummer. Kürzt bewusst nichts — Banken
 * akzeptieren >27 Zeichen bei SEPA-Inland üblicherweise ohne Warnung.
 */
export function paymentReferenceForInvoice(invoiceNumber: string, tenantSlug: string): string {
  return `${invoiceNumber} ${tenantSlug}`.slice(0, 140);
}
