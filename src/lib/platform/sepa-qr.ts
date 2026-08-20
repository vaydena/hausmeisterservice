import 'server-only';
import QRCode from 'qrcode';

/**
 * SEPA-Überweisungs-QR ("GiroCode", EPC069-12). Banking-Apps scannen den Code
 * und füllen damit eine Überweisung vor: Empfänger, IBAN, BIC, Betrag und
 * Verwendungszweck. Damit muss der Zahler nichts abtippen.
 *
 * Der Payload-Aufbau folgt der EPC-Spezifikation (Service-Tag "BCD",
 * Version 002, Zeichensatz 1 = UTF-8, SEPA Credit Transfer). Wir erzeugen den
 * Code server-seitig als fertigen SVG-String — im selben Stil wie
 * `src/lib/qr/generate.ts`, damit nur eine QR-Mechanik im Haus lebt.
 */

const EPC_MAX_BYTES = 331;
const MAX_NAME_LENGTH = 70;
const MAX_IBAN_LENGTH = 34;
const MAX_REMITTANCE_LENGTH = 140;
const MIN_AMOUNT = 0.01;
const MAX_AMOUNT = 999999999.99;

export interface SepaQrParams {
  /** Kontoinhaber / Zahlungsempfänger */
  holder: string;
  /** IBAN — Leerzeichen werden entfernt */
  iban: string;
  /** BIC — Leerzeichen werden entfernt, optional */
  bic?: string | null;
  /** Betrag in Euro */
  amount: number;
  /** Verwendungszweck (Freitext) */
  reference: string;
}

function stripSpaces(value: string): string {
  return value.replace(/\s+/g, '');
}

/**
 * Baut den EPC/GiroCode-Payload oder gibt `null` zurück, wenn ein Feld die
 * Spezifikation verletzt (zu lang, ungültiger Betrag, BIC-Länge ≠ 8/11). Der
 * Aufrufer blendet den QR dann einfach aus und lässt die Klartext-Bankdaten
 * stehen.
 */
export function buildEpcQrPayload(params: SepaQrParams): string | null {
  const holder = params.holder.trim();
  const iban = stripSpaces(params.iban).toUpperCase();
  const bic = params.bic ? stripSpaces(params.bic).toUpperCase() : '';
  const reference = params.reference.trim();

  if (!holder || holder.length > MAX_NAME_LENGTH) return null;
  if (!iban || iban.length > MAX_IBAN_LENGTH) return null;
  if (bic && bic.length !== 8 && bic.length !== 11) return null;
  if (reference.length > MAX_REMITTANCE_LENGTH) return null;

  if (!Number.isFinite(params.amount)) return null;
  // Auf Cent runden, damit Gleitkomma-Reste nicht zu "EUR15.000000001" führen.
  const amount = Math.round(params.amount * 100) / 100;
  if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) return null;

  const lines = [
    'BCD',
    '002',
    '1',
    'SCT',
    bic,
    holder,
    iban,
    `EUR${amount.toFixed(2)}`,
    '', // Zweckcode — nicht belegt
    '', // strukturierter Verwendungszweck — wir nutzen den Freitext darunter
    reference,
  ];

  const payload = lines.join('\n');

  // Die Spezifikation begrenzt den gesamten Block auf 331 Byte.
  if (Buffer.byteLength(payload, 'utf8') > EPC_MAX_BYTES) return null;

  return payload;
}

/**
 * Erzeugt den GiroCode als fertigen SVG-String, oder `null`, wenn die Daten
 * ungültig sind. Fehlerkorrektur M ist die von EPC069-12 empfohlene Stufe;
 * `margin: 4` hält die vorgeschriebene Ruhezone ein (sonst erkennen manche
 * Scanner den Code nicht).
 */
export async function generateSepaQrSvg(params: SepaQrParams): Promise<string | null> {
  const payload = buildEpcQrPayload(params);
  if (!payload) return null;
  return QRCode.toString(payload, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 4,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}
