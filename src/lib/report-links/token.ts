import { randomBytes } from 'node:crypto';

/**
 * Sprint 124 · Token fuer oeffentliche Melde-Links.
 *
 * Der Token steht in einer URL, die auf einem Aufkleber im Hausflur klebt.
 * Zwei Konsequenzen fuer die Wahl des Alphabets:
 *
 *   - Kleinbuchstaben und Ziffern, keine Sonderzeichen: der Token muss ohne
 *     Prozent-Kodierung in einen Pfad passen und darf beim Vorlesen am
 *     Telefon nicht in Gross-/Kleinschreibung zerfallen.
 *   - Ohne 0/1/i/l/o/u: die ersten vier sind in gedruckter Schrift paarweise
 *     verwechselbar, `u` faellt raus, damit aus zufaelligen Zeichenfolgen
 *     keine lesbaren Woerter entstehen, die auf einem Aufkleber peinlich
 *     werden koennen.
 *
 * 30 Zeichen bei Laenge 26 sind ~2.5e38 Moeglichkeiten. Der Token ist
 * trotzdem KEIN Geheimnis — er haengt an einer Hauswand. Die Laenge
 * verhindert das Erraten fremder Objekte, nicht das Abfotografieren des
 * eigenen Aufklebers; dagegen hilft nur `active = false`.
 */
export const REPORT_TOKEN_ALPHABET = '23456789abcdefghjkmnpqrstvwxyz';
export const REPORT_TOKEN_LENGTH = 26;

/**
 * Untere/obere Schranke der Formatpruefung. Bewusst ein Bereich und nicht
 * `=== REPORT_TOKEN_LENGTH`: sonst wuerde eine spaetere Laengenaenderung des
 * Generators jeden bereits gedruckten Aufkleber ungueltig machen. Die
 * Grenzen spiegeln die CHECK-Constraint der Tabelle
 * (property_report_links_token_length_check).
 */
export const REPORT_TOKEN_MIN_LENGTH = 22;
export const REPORT_TOKEN_MAX_LENGTH = 64;

const TOKEN_RE = new RegExp(
  `^[${REPORT_TOKEN_ALPHABET}]{${REPORT_TOKEN_MIN_LENGTH},${REPORT_TOKEN_MAX_LENGTH}}$`,
);

/**
 * Groesstes Vielfaches von 30 unterhalb 256. Bytes ab hier werden verworfen
 * statt per Modulo abgebildet — sonst waeren die ersten 16 Zeichen des
 * Alphabets minimal wahrscheinlicher als der Rest (Modulo-Bias).
 */
const REJECTION_CEILING =
  256 - (256 % REPORT_TOKEN_ALPHABET.length);

export function generateReportToken(length: number = REPORT_TOKEN_LENGTH): string {
  let out = '';
  while (out.length < length) {
    // Grosszuegig ziehen: bei ~6% Verwurfsrate reicht ein Puffer in
    // Zielgroesse fast immer fuer den kompletten Token.
    for (const byte of randomBytes(length)) {
      if (byte >= REJECTION_CEILING) continue;
      out += REPORT_TOKEN_ALPHABET[byte % REPORT_TOKEN_ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/**
 * Formatpruefung VOR dem Datenbankzugriff. Der Token kommt aus dem
 * URL-Pfad, ist also beliebiger Fremdtext; ohne diese Schranke landet
 * jeder Scanner-Treffer als Query in der Datenbank.
 */
export function isValidReportToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value);
}
