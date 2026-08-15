import { describe, it, expect } from 'vitest';
import {
  openHours,
  isStaleOpenEntry,
  describeOwnOpenEntry,
  summarizeUnclosedEntries,
  describeUnclosedEntries,
  STALE_OPEN_AFTER_HOURS,
} from '@/lib/time-tracking/unclosed';

/**
 * Sprint 108: Diese Pruefung ist die Gegenprobe zum verschluckten Query-Fehler
 * in punchOutAction. Der Fehler hinterlaesst einen Eintrag mit end_at NULL,
 * und der ist in jeder Auswertung null Minuten wert. Hier wird geprueft, dass
 * genau dieser Zustand erkannt wird — und dass eine normal laufende Schicht
 * in Ruhe gelassen wird.
 */

const NOW = new Date('2026-08-15T18:00:00.000Z');

function hoursAgo(h: number): string {
  return new Date(NOW.getTime() - h * 3_600_000).toISOString();
}

describe('openHours', () => {
  it('misst die Laufzeit ab start_at', () => {
    expect(openHours(hoursAgo(3), NOW)).toBeCloseTo(3, 6);
  });

  it('liefert 0 statt einer negativen Zahl, wenn der Start in der Zukunft liegt', () => {
    // Kann durch Uhrendrift zwischen Server und DB entstehen. Eine negative
    // Stundenzahl im Warntext waere schlimmer als gar keine Warnung.
    expect(openHours(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toBe(0);
  });

  it('liefert 0 bei einem unlesbaren Zeitstempel statt NaN', () => {
    expect(openHours('kein-datum', NOW)).toBe(0);
  });
});

describe('isStaleOpenEntry', () => {
  it('laesst eine normale Schicht durchgehen', () => {
    // Acht Stunden sind ein Arbeitstag, keine Stoerung. Eine Warnung, die
    // jeden Nachmittag erscheint, wird nach drei Tagen weggeklickt.
    expect(isStaleOpenEntry(hoursAgo(8), NOW)).toBe(false);
  });

  it('schlaegt genau ab der Schwelle an', () => {
    expect(isStaleOpenEntry(hoursAgo(STALE_OPEN_AFTER_HOURS), NOW)).toBe(true);
    expect(isStaleOpenEntry(hoursAgo(STALE_OPEN_AFTER_HOURS - 0.5), NOW)).toBe(false);
  });

  it('erkennt den vergessenen Feierabend von gestern', () => {
    expect(isStaleOpenEntry(hoursAgo(26), NOW)).toBe(true);
  });
});

describe('describeOwnOpenEntry', () => {
  it('schweigt, solange die Zeit plausibel laeuft', () => {
    expect(describeOwnOpenEntry(hoursAgo(2), NOW)).toBeNull();
  });

  it('nennt die Laufzeit in vollen Stunden', () => {
    const text = describeOwnOpenEntry(hoursAgo(26.7), NOW);
    expect(text).toContain('26 Stunden');
  });

  it('nennt die Folge, nicht nur den Befund', () => {
    // "Zeit laeuft noch" ist keine Information — dass sie in keiner
    // Auswertung mitzaehlt, ist der Grund zu handeln.
    const text = describeOwnOpenEntry(hoursAgo(20), NOW) ?? '';
    expect(text).toContain('Wochensumme');
    expect(text).toContain('Lohn-Export');
  });
});

describe('summarizeUnclosedEntries', () => {
  const entries = [
    { start_at: hoursAgo(30), end_at: null, person_id: 'u1' },
    { start_at: hoursAgo(4), end_at: null, person_id: 'u2' },
    { start_at: hoursAgo(50), end_at: hoursAgo(42), person_id: 'u1' },
  ];

  it('zaehlt nur Eintraege ohne Ende', () => {
    expect(summarizeUnclosedEntries(entries, NOW).count).toBe(2);
  });

  it('trennt die ueberfaelligen von den gerade laufenden', () => {
    // Der Eintrag von vor vier Stunden ist jemand, der gerade arbeitet.
    expect(summarizeUnclosedEntries(entries, NOW).staleCount).toBe(1);
  });

  it('zaehlt betroffene Personen, nicht Eintraege', () => {
    const doppelt = [
      { start_at: hoursAgo(30), end_at: null, person_id: 'u1' },
      { start_at: hoursAgo(54), end_at: null, person_id: 'u1' },
    ];
    const out = summarizeUnclosedEntries(doppelt, NOW);
    expect(out.count).toBe(2);
    expect(out.personCount).toBe(1);
  });

  it('kommt ohne person_id aus', () => {
    const out = summarizeUnclosedEntries([{ start_at: hoursAgo(30), end_at: null }], NOW);
    expect(out.count).toBe(1);
    expect(out.personCount).toBe(0);
  });

  it('nennt den aeltesten offenen Eintrag', () => {
    expect(summarizeUnclosedEntries(entries, NOW).oldestStartAt).toBe(hoursAgo(30));
  });

  it('meldet bei lauter abgeschlossenen Zeiten nichts', () => {
    const geschlossen = [{ start_at: hoursAgo(9), end_at: hoursAgo(1), person_id: 'u1' }];
    expect(summarizeUnclosedEntries(geschlossen, NOW).count).toBe(0);
  });

  it('meldet bei einer leeren Liste nichts', () => {
    // Wichtig, weil eine leere Liste hier der Normalfall ist: kein Betrieb
    // hat staendig offene Zeiten.
    const out = summarizeUnclosedEntries([], NOW);
    expect(out).toEqual({ count: 0, staleCount: 0, personCount: 0, oldestStartAt: null });
  });
});

describe('describeUnclosedEntries', () => {
  it('gibt null zurueck, wenn nichts fehlt', () => {
    expect(describeUnclosedEntries(summarizeUnclosedEntries([], NOW))).toBeNull();
  });

  it('formuliert den Einzelfall im Singular', () => {
    const text = describeUnclosedEntries(
      summarizeUnclosedEntries([{ start_at: hoursAgo(30), end_at: null, person_id: 'u1' }], NOW),
    );
    expect(text).toContain('1 Eintrag hat');
  });

  it('nennt die Zahl der Mitarbeiter erst ab zwei', () => {
    const einer = describeUnclosedEntries(
      summarizeUnclosedEntries(
        [
          { start_at: hoursAgo(30), end_at: null, person_id: 'u1' },
          { start_at: hoursAgo(54), end_at: null, person_id: 'u1' },
        ],
        NOW,
      ),
    );
    expect(einer).not.toContain('Mitarbeitern');

    const zwei = describeUnclosedEntries(
      summarizeUnclosedEntries(
        [
          { start_at: hoursAgo(30), end_at: null, person_id: 'u1' },
          { start_at: hoursAgo(54), end_at: null, person_id: 'u2' },
        ],
        NOW,
      ),
    );
    expect(zwei).toContain('bei 2 Mitarbeitern');
  });

  it('sagt, dass die ausgewiesene Stundenzahl zu niedrig ist', () => {
    // Der ganze Zweck der Meldung. Wer eine Lohnabrechnung aus der Zahl
    // macht, muss das wissen — "N offene Eintraege" allein sagt es nicht.
    const text =
      describeUnclosedEntries(
        summarizeUnclosedEntries([{ start_at: hoursAgo(30), end_at: null }], NOW),
      ) ?? '';
    expect(text).toContain('zu niedrig');
    expect(text).toContain('fehlen');
  });
});
