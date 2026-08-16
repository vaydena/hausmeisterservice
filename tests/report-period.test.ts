import { describe, expect, it } from 'vitest';
import { parsePeriod, parsePeriodRange, todayIsoDate } from '@/lib/reports/utils';
import { addDaysToKey, todayKey } from '@/lib/utils/datetime-local';

/**
 * Sprint 113: Alle sechs Berichtsseiten und CSV-Exporte haben ihr Zeitfenster
 * selbst gebaut — `${from}T00:00:00Z` bis `${to}T23:59:59Z`. Das ist der
 * UTC-Tag, nicht der Berliner, und es laesst zusaetzlich die letzte Sekunde
 * des Endtages in einer Luecke zwischen den Grenzen liegen.
 *
 * Fuer den Zeitbericht heisst das konkret: eine Fruehschicht ab 06:00 am
 * Monatsersten faellt im Sommer in den Vormonat. Diese Datei haelt fest, dass
 * das Fenster jetzt genau die angefragten Berliner Kalendertage abdeckt.
 */
describe('parsePeriodRange', () => {
  it('verankert das Fenster an Berliner Mitternacht, nicht an UTC', () => {
    const r = parsePeriodRange({ from: '2026-08-01', to: '2026-08-31' });
    // Sommerzeit (+2): der 01.08. beginnt um 22:00 UTC am 31.07.
    expect(r.startIso).toBe('2026-07-31T22:00:00.000Z');
    expect(r.endIso).toBe('2026-08-31T22:00:00.000Z');
  });

  it('schliesst die Fruehschicht am Monatsersten ein', () => {
    // Der alte Code begann bei `2026-08-01T00:00:00Z` = 02:00 Berliner Zeit.
    // Eine Schicht ab 06:00 lag zwar drin, eine ab 00:30 aber nicht — und am
    // Monatsende kamen dafuer zwei Stunden des Folgemonats dazu.
    const r = parsePeriodRange({ from: '2026-08-01', to: '2026-08-31' });
    const frueh = '2026-07-31T22:30:00.000Z'; // 00:30 Berliner Zeit am 01.08.
    expect(frueh >= r.startIso && frueh < r.endIso).toBe(true);

    const naechsterMonat = '2026-08-31T22:30:00.000Z'; // 00:30 am 01.09.
    expect(naechsterMonat < r.endIso).toBe(false);
  });

  it('laesst keine Luecke am Ende des letzten Tages', () => {
    // Die alte Obergrenze war 23:59:59 — alles danach fiel heraus.
    const r = parsePeriodRange({ from: '2026-08-01', to: '2026-08-31' });
    const kurzVorMitternacht = '2026-08-31T21:59:59.500Z'; // 23:59:59.5 Berlin
    expect(kurzVorMitternacht < r.endIso).toBe(true);
  });

  it('haelt die Grenze ueber die Zeitumstellung hinweg', () => {
    // Oktober beginnt in MESZ (+2) und endet in MEZ (+1).
    const r = parsePeriodRange({ from: '2026-10-01', to: '2026-10-31' });
    expect(r.startIso).toBe('2026-09-30T22:00:00.000Z');
    expect(r.endIso).toBe('2026-10-31T23:00:00.000Z');
  });

  it('reicht from/to unveraendert durch — sie stehen im Formular und im Dateinamen', () => {
    const r = parsePeriodRange({ from: '2026-08-01', to: '2026-08-31' });
    expect(r.from).toBe('2026-08-01');
    expect(r.to).toBe('2026-08-31');
  });

  it('faellt auf den Standardzeitraum zurueck, statt ein leeres Fenster zu liefern', () => {
    // Die Regex in parsePeriod laesst "2026-02-31" durch, den Kalender gibt es
    // aber nicht. Ein Bericht ueber ein kaputtes Fenster waere schlimmer als
    // einer ueber den Standardzeitraum: er saehe aus wie "keine Daten".
    const r = parsePeriodRange({ from: '2026-02-31', to: '2026-02-31' });
    expect(r.to).toBe(todayKey());
    expect(r.from).toBe(addDaysToKey(todayKey(), -30));
    expect(r.startIso < r.endIso).toBe(true);
  });

  it('nimmt denselben Standardzeitraum wie parsePeriod, wenn nichts angefragt ist', () => {
    const plain = parsePeriod({});
    const withRange = parsePeriodRange({});
    expect(withRange.to).toBe(plain.to);
  });
});

describe('todayIsoDate', () => {
  it('ist der Berliner Kalendertag', () => {
    // Lief ueber `toISOString().slice(0, 10)`: zwischen 22:00 und Mitternacht
    // Berliner Zeit war das noch der Vortag, und der voreingestellte
    // Berichtszeitraum endete dann gestern.
    expect(todayIsoDate()).toBe(todayKey());
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
