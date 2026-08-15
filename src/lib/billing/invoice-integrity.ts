/**
 * Sprint 107: Ist diese Rechnung ueberhaupt versandfaehig?
 *
 * Anlass sind zwei Stellen im Rechnungspfad, die aus einem verschluckten
 * Query-Fehler ein plausibel aussehendes Dokument gemacht haben:
 *
 *   - `recalcInvoiceTotals` rechnete bei einem Fehler aus einer leeren Liste
 *     und schrieb die gespeicherte Summe auf 0.
 *   - `loadBillingDocumentData` rendert die Positionen aus einer eigenen
 *     Query, die Summen aber aus dem Kopfsatz. Fiel die Positionen-Query aus,
 *     stand im PDF ein Gesamtbetrag ohne eine einzige Position darunter — und
 *     ohne Umsatzsteuerzeile, weil die aus den Positionen aggregiert wird.
 *
 * Beide Fehler sind jetzt behoben (die Queries werfen). Was bleibt, ist der
 * Grund, warum sie so lange unbemerkt blieben: Es gab keinen Ort, an dem das
 * Dokument gegen sich selbst geprueft wurde. Eine Rechnung, deren Kopfsumme
 * nicht zu ihren Positionen passt, sah genauso aus wie eine korrekte.
 *
 * Diese Datei prueft genau das — und zusaetzlich die Angaben, die §14 Abs. 4
 * UStG von jeder Rechnung verlangt und die aus den Mandanten-Einstellungen
 * kommen. Fehlt die Steuernummer, ist die Rechnung fuer den Empfaenger nicht
 * zum Vorsteuerabzug tauglich; er wird eine korrigierte anfordern.
 *
 * Bewusst nur eine WARNUNG, kein Versand-Block: ob eine Rechnung rausgeht,
 * ist eine Entscheidung des Betreibers, nicht dieser Software. Die Aufgabe
 * hier ist, dass er sie informiert trifft — vor dem Absenden, nicht wenn der
 * Kunde reklamiert.
 *
 * Angebote werden NICHT geprueft: §14 UStG gilt fuer Rechnungen, und ein
 * Angebot ohne Positionen ist ein Entwurf, kein Mangel.
 */

import { computeDocumentTotals } from '@/lib/schemas/billing';
import type { TenantAddress } from '@/lib/schemas/tenant';

export type InvoiceDefect =
  | 'sender_name'
  | 'sender_address'
  | 'sender_tax_number'
  | 'issue_date'
  | 'no_line_items'
  | 'totals_mismatch';

/**
 * Kurztexte fuer die Oberflaeche. Jeder nennt die Folge, nicht nur den
 * Mangel — "fehlt" allein beantwortet nicht, warum es jetzt wichtig ist.
 */
export const INVOICE_DEFECT_LABEL: Record<InvoiceDefect, string> = {
  sender_name:
    'Kein Absendername hinterlegt — die Rechnung geht ohne Firmenbezeichnung raus.',
  sender_address:
    'Absender-Anschrift unvollständig (Straße, PLZ und Ort nötig) — nach § 14 UStG Pflichtangabe.',
  sender_tax_number:
    'Weder Steuernummer noch USt-IdNr. hinterlegt — nach § 14 UStG Pflichtangabe. Ohne sie kann der Empfänger keine Vorsteuer ziehen.',
  issue_date: 'Kein Rechnungsdatum gesetzt — nach § 14 UStG Pflichtangabe.',
  no_line_items:
    'Die Rechnung hat keine Positionen. Im PDF stünde ein Gesamtbetrag ohne jede Leistung darunter.',
  totals_mismatch:
    'Die gespeicherte Summe passt nicht zu den Positionen. Im PDF stünden Positionen und Gesamtbetrag, die nicht zusammenpassen.',
};

export interface InvoiceIntegrityInput {
  issuedAt: string | null;
  netTotalCents: number;
  taxTotalCents: number;
  grossTotalCents: number;
  lines: ReadonlyArray<{ net_cents: number; tax_cents: number; gross_cents: number }>;
  sender: {
    name: string | null;
    legalName: string | null;
    address: TenantAddress;
    taxId: string | null;
    vatId: string | null;
  };
}

function hasText(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Liefert die Maengel in fester Reihenfolge: erst der Absender (einmal in den
 * Einstellungen behoben, gilt er fuer alle Rechnungen), dann das einzelne
 * Dokument. So steht in der Oberflaeche das oben, was der Betreiber einmal
 * erledigt und danach nie wieder sieht.
 */
export function findInvoiceDefects(input: InvoiceIntegrityInput): InvoiceDefect[] {
  const defects: InvoiceDefect[] = [];
  const { sender } = input;

  if (!hasText(sender.legalName) && !hasText(sender.name)) {
    defects.push('sender_name');
  }
  const addr = sender.address;
  if (!hasText(addr.street) || !hasText(addr.zip) || !hasText(addr.city)) {
    defects.push('sender_address');
  }
  // Entweder-oder: §14 Abs. 4 Nr. 2 laesst beide Nummern gelten, und ein
  // Kleinunternehmer hat regelmaessig nur die Steuernummer.
  if (!hasText(sender.taxId) && !hasText(sender.vatId)) {
    defects.push('sender_tax_number');
  }

  if (!hasText(input.issuedAt)) {
    defects.push('issue_date');
  }

  if (input.lines.length === 0) {
    defects.push('no_line_items');
    // Ohne Positionen ist jede Summe ungedeckt; das als zweiten Mangel zu
    // melden waere derselbe Befund zweimal.
    return defects;
  }

  const summed = computeDocumentTotals([...input.lines]);
  if (
    summed.net_total_cents !== input.netTotalCents ||
    summed.tax_total_cents !== input.taxTotalCents ||
    summed.gross_total_cents !== input.grossTotalCents
  ) {
    defects.push('totals_mismatch');
  }

  return defects;
}

/**
 * Einzeiler fuer Stellen, an denen kein Platz fuer eine Liste ist (z. B. der
 * Versand-Dialog). `null`, wenn nichts zu melden ist — der Aufrufer rendert
 * dann gar nichts, statt einen leeren Kasten zu zeigen.
 */
export function summarizeInvoiceDefects(defects: readonly InvoiceDefect[]): string | null {
  if (defects.length === 0) return null;
  return defects.map((d) => INVOICE_DEFECT_LABEL[d]).join(' ');
}
