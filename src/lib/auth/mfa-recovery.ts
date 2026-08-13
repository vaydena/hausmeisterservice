import 'server-only';
import { randomInt } from 'node:crypto';

/**
 * Base32-artiges Alphabet ohne verwechselbare Zeichen (0/O, 1/I/L, U/V).
 * 32 Zeichen, wodurch jeder Code-Character exakt 5 Bit Entropie liefert.
 * Bei 8 Zeichen pro Code = 40 Bit = ~1.1e12 Moeglichkeiten pro Code.
 * Bei 10 Codes und einem Rate-Limit von 5 Versuchen alle 15 Minuten braucht
 * ein Online-Brute-Force im Schnitt Millionen Jahre pro Konto.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 8;

const RECOVERY_CODE_COUNT = 10;

/**
 * Zufaelliger 8-stelliger Code aus CODE_ALPHABET. randomInt(0, 32) nutzt
 * node:crypto (nicht Math.random) — die Codes sind kryptographisch sicher
 * und muessen es sein: sie ersetzen im Notfall den TOTP-Faktor.
 */
function generateOneCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Erzeugt einen Batch von zehn frischen Recovery-Codes fuer den Konto-
 * Wiederherstellungs-Flow. Rueckgabe im Format `XXXX-XXXX` (Bindestrich
 * fuer Lesbarkeit — der Vergleich in der DB entfernt den Strich wieder).
 */
export function generateRecoveryCodePlaintexts(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = generateOneCode();
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}

/**
 * Normalisierung fuer den Vergleich: alle Whitespaces + Bindestriche
 * weg, upper-case. Damit tolerieren wir sowohl "xxxx-xxxx", "xxxxxxxx",
 * "xxxx xxxx" als auch case-Fehler bei der Eingabe.
 */
export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Zerlegung von normalisiertem Code auf das UI-Format `XXXX-XXXX`.
 * Nur fuer die Anzeige der frisch generierten Codes ans UI — die DB
 * speichert nur bcrypt-Hashes, kein Format.
 */
export function formatForDisplay(normalized: string): string {
  if (normalized.length !== CODE_LEN) return normalized;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export const RECOVERY_CODE_LENGTH = CODE_LEN;
export const RECOVERY_CODE_ALPHABET = CODE_ALPHABET;
