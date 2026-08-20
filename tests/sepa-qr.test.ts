import { describe, it, expect } from 'vitest';
import { buildEpcQrPayload } from '../src/lib/platform/sepa-qr';

/**
 * Der GiroCode (EPC069-12) ist zahlungsnah: stimmt der Payload nicht, füllt die
 * Banking-App eine falsche oder gar keine Überweisung vor. Diese Tests nageln
 * die Zeilenstruktur, die Betrags-Formatierung und die Validierung fest.
 */
describe('SEPA-GiroCode (EPC069-12) Payload', () => {
  const base = {
    holder: 'Karl-Heinz Bicker',
    iban: 'DE95 7005 1003 0000 7853 03',
    bic: 'BYLADEM1FSI',
    amount: 49,
    reference: 'RE-2026-0001 textfirma',
  };

  it('baut die 11 Zeilen in der Spezifikations-Reihenfolge', () => {
    const payload = buildEpcQrPayload(base);
    expect(payload).not.toBeNull();
    const lines = payload!.split('\n');
    expect(lines).toHaveLength(11);
    expect(lines[0]).toBe('BCD');
    expect(lines[1]).toBe('002');
    expect(lines[2]).toBe('1');
    expect(lines[3]).toBe('SCT');
    expect(lines[4]).toBe('BYLADEM1FSI'); // BIC
    expect(lines[5]).toBe('Karl-Heinz Bicker'); // Empfänger
    expect(lines[6]).toBe('DE95700510030000785303'); // IBAN: Leerzeichen weg, groß
    expect(lines[7]).toBe('EUR49.00'); // Betrag, 2 Nachkommastellen
    expect(lines[8]).toBe(''); // Zweckcode leer
    expect(lines[9]).toBe(''); // strukturierter Verwendungszweck leer
    expect(lines[10]).toBe('RE-2026-0001 textfirma'); // Verwendungszweck (Freitext)
  });

  it('formatiert den Betrag mit 2 Stellen und rundet auf Cent', () => {
    expect(buildEpcQrPayload({ ...base, amount: 1490 })!.split('\n')[7]).toBe('EUR1490.00');
    expect(buildEpcQrPayload({ ...base, amount: 12.3 })!.split('\n')[7]).toBe('EUR12.30');
    expect(buildEpcQrPayload({ ...base, amount: 12.999 })!.split('\n')[7]).toBe('EUR13.00');
  });

  it('normalisiert die IBAN (Großschreibung, keine Leerzeichen)', () => {
    expect(
      buildEpcQrPayload({ ...base, iban: 'de95 7005 1003 0000 7853 03' })!.split('\n')[6],
    ).toBe('DE95700510030000785303');
  });

  it('lässt eine leere BIC zu (Version 002 — BIC im EWR optional)', () => {
    const payload = buildEpcQrPayload({ ...base, bic: null });
    expect(payload).not.toBeNull();
    expect(payload!.split('\n')[4]).toBe('');
  });

  it('verwirft ungültige Eingaben mit null statt zu werfen', () => {
    expect(buildEpcQrPayload({ ...base, bic: 'ABC' })).toBeNull(); // BIC-Länge ≠ 8/11
    expect(buildEpcQrPayload({ ...base, holder: 'x'.repeat(71) })).toBeNull(); // Name > 70
    expect(buildEpcQrPayload({ ...base, reference: 'x'.repeat(141) })).toBeNull(); // Zweck > 140
    expect(buildEpcQrPayload({ ...base, amount: 0 })).toBeNull(); // Betrag < 0,01
    expect(buildEpcQrPayload({ ...base, amount: Number.NaN })).toBeNull(); // kein endlicher Betrag
  });
});
