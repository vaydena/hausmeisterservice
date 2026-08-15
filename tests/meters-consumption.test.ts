import { describe, it, expect } from 'vitest';
import {
  buildConsumptionChain,
  checkReadingPlacement,
  countImplausible,
  describeImplausibleChain,
  describePlacementProblem,
  formatDelta,
  latestConsumptionState,
  latestEntry,
  parseReading,
  type ReadingLike,
} from '@/lib/meters/consumption';

/**
 * Sprint 111. Zwei Dinge sind hier bewusst anders als in den Tests der
 * Sprints 109 und 110:
 *
 *  - Die Zaehlerstaende stehen als STRINGS in den Fixtures. Genau so kommen
 *    sie aus PostgREST, weil NUMERIC(14,4) als String serialisiert wird
 *    (live nachgeprueft: "14612.5000"). Ein Test, der `number` einsetzt,
 *    wuerde die Stelle testen, an der der Fehler NICHT sitzt.
 *  - Es gibt keinen eingefrorenen "Jetzt"-Zeitpunkt. Die Plausibilitaet
 *    eines Zaehlerstands haengt an seinen Nachbarn, nicht am Kalender.
 */

function read(
  id: string,
  readAt: string,
  reading: string,
  is_reset = false,
): ReadingLike {
  return { id, read_at: readAt, reading, is_reset };
}

describe('parseReading', () => {
  it('liest den NUMERIC-String aus PostgREST', () => {
    expect(parseReading('14612.5000')).toBe(14612.5);
  });

  it('nimmt auch echte Zahlen', () => {
    expect(parseReading(402.7)).toBe(402.7);
  });

  it('meldet Unlesbares als null statt als 0', () => {
    // Der entscheidende Test des Moduls: 0 ist ein GUELTIGER Zaehlerstand.
    // Ein `Number(x) || 0` wuerde aus "unbekannt" einen frisch getauschten
    // Zaehler machen — und in der naechsten Differenz den kompletten
    // Vorgaengerstand als Verbrauch ausweisen.
    expect(parseReading(null)).toBeNull();
    expect(parseReading(undefined)).toBeNull();
    expect(parseReading('')).toBeNull();
    expect(parseReading('   ')).toBeNull();
    expect(parseReading('keine Ahnung')).toBeNull();
    expect(parseReading(Number.NaN)).toBeNull();
    expect(parseReading(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('behaelt die Null als Wert', () => {
    expect(parseReading('0.0000')).toBe(0);
    expect(parseReading(0)).toBe(0);
  });
});

describe('buildConsumptionChain', () => {
  it('rechnet den Verbrauch zwischen aufeinanderfolgenden Ablesungen', () => {
    const chain = buildConsumptionChain([
      read('a', '2026-02-05T07:36:18Z', '12450.0000'),
      read('b', '2026-05-06T07:36:18Z', '13820.0000'),
      read('c', '2026-07-30T07:36:18Z', '14612.5000'),
    ]);

    expect(chain.map((e) => e.delta)).toEqual([null, 1370, 792.5]);
    expect(chain.every((e) => !e.implausible)).toBe(true);
  });

  it('sortiert selbst, egal wie der Aufrufer laedt', () => {
    // Beide Seiten laden absteigend (order read_at desc), ein nachgetragener
    // Stand liegt ausserdem zwischen zwei bestehenden. Das Modul darf sich
    // auf keine Reihenfolge verlassen.
    const chain = buildConsumptionChain([
      read('c', '2026-07-30T07:36:18Z', '14612.5000'),
      read('a', '2026-02-05T07:36:18Z', '12450.0000'),
      read('b', '2026-05-06T07:36:18Z', '13820.0000'),
    ]);

    expect(chain.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('erste Ablesung hat keinen Verbrauch', () => {
    const chain = buildConsumptionChain([read('a', '2026-02-05T07:36:18Z', '12450.0000')]);
    expect(chain[0]!.delta).toBeNull();
    expect(chain[0]!.implausible).toBe(false);
  });

  it('leere Eingabe bleibt leer', () => {
    expect(buildConsumptionChain([])).toEqual([]);
  });

  it('ein Zaehlertausch erzeugt keinen Verbrauch', () => {
    // Der Kern der is_reset-Semantik: nach dem Tausch ist die Differenz zum
    // Vorgaengerstand kein Verbrauch, sondern der Sprung zwischen zwei
    // Geraeten. 0 - 14612,5 waeren -14.612,5 kWh.
    const chain = buildConsumptionChain([
      read('a', '2026-05-06T07:36:18Z', '14000.0000'),
      read('b', '2026-06-15T09:00:00Z', '0.0000', true),
      read('c', '2026-07-30T07:36:18Z', '50.0000'),
    ]);

    expect(chain.map((e) => e.delta)).toEqual([null, null, 50]);
    expect(chain[1]!.implausible).toBe(false);
  });

  it('die Ablesung NACH dem Tausch rechnet gegen den Startwert des neuen Zaehlers', () => {
    const chain = buildConsumptionChain([
      read('a', '2026-06-15T09:00:00Z', '120.0000', true),
      read('b', '2026-07-30T07:36:18Z', '198.4000'),
    ]);

    expect(chain[1]!.delta).toBe(78.4);
  });

  it('markiert einen rueckwaerts gelaufenen Zaehler', () => {
    // Genau das, was die halb durchgesetzte Regel entstehen liess: ein
    // nachgetragener Juni-Stand ueber dem Juli-Stand.
    const chain = buildConsumptionChain([
      read('a', '2026-05-06T07:36:18Z', '13820.0000'),
      read('b', '2026-06-15T09:00:00Z', '15000.0000'),
      read('c', '2026-07-30T07:36:18Z', '14612.5000'),
    ]);

    expect(chain[2]!.delta).toBe(-387.5);
    expect(chain[2]!.implausible).toBe(true);
    expect(countImplausible(chain)).toBe(1);
  });

  it('ein Verbrauch von 0 ist plausibel', () => {
    // Leerstand, abgestellter Zaehler, zwei Ablesungen am selben Tag.
    const chain = buildConsumptionChain([
      read('a', '2026-05-06T07:36:18Z', '402.7000'),
      read('b', '2026-05-07T07:36:18Z', '402.7000'),
    ]);

    expect(chain[1]!.delta).toBe(0);
    expect(chain[1]!.implausible).toBe(false);
  });

  it('rundet auf die vier Nachkommastellen der Spalte', () => {
    const chain = buildConsumptionChain([
      read('a', '2026-05-06T07:36:18Z', '0.1000'),
      read('b', '2026-05-07T07:36:18Z', '0.3000'),
    ]);

    // 0.3 - 0.1 ist in IEEE-754 0.19999999999999998.
    expect(chain[1]!.delta).toBe(0.2);
  });

  it('laesst eine Zeile mit unlesbarem Stand aus der Kette', () => {
    const chain = buildConsumptionChain([
      read('a', '2026-05-06T07:36:18Z', '100.0000'),
      { id: 'b', read_at: '2026-06-06T07:36:18Z', reading: 'kaputt', is_reset: false },
      read('c', '2026-07-06T07:36:18Z', '150.0000'),
    ]);

    expect(chain.map((e) => e.id)).toEqual(['a', 'c']);
    expect(chain[1]!.delta).toBe(50);
  });
});

describe('latestConsumptionState', () => {
  it('unterscheidet "keine Ablesung" von "zu wenig Ablesungen"', () => {
    expect(latestConsumptionState(buildConsumptionChain([])).kind).toBe('none');
    expect(
      latestConsumptionState(
        buildConsumptionChain([read('a', '2026-05-06T07:36:18Z', '100.0000')]),
      ).kind,
    ).toBe('insufficient');
  });

  it('meldet einen Zaehlertausch als eigenen Zustand', () => {
    const chain = buildConsumptionChain([
      read('a', '2026-05-06T07:36:18Z', '14000.0000'),
      read('b', '2026-06-15T09:00:00Z', '0.0000', true),
    ]);

    expect(latestConsumptionState(chain).kind).toBe('after_reset');
  });

  it('liefert den letzten Verbrauch mit Plausibilitaetsflag', () => {
    const chain = buildConsumptionChain([
      read('a', '2026-05-06T07:36:18Z', '13820.0000'),
      read('b', '2026-07-30T07:36:18Z', '14612.5000'),
    ]);

    expect(latestConsumptionState(chain)).toEqual({
      kind: 'value',
      delta: 792.5,
      implausible: false,
    });
  });

  it('reicht einen negativen Verbrauch als solchen durch', () => {
    const chain = buildConsumptionChain([
      read('a', '2026-06-15T09:00:00Z', '15000.0000'),
      read('b', '2026-07-30T07:36:18Z', '14612.5000'),
    ]);

    expect(latestConsumptionState(chain)).toEqual({
      kind: 'value',
      delta: -387.5,
      implausible: true,
    });
  });

  it('latestEntry nimmt das chronologisch letzte, nicht das zuerst geladene', () => {
    const chain = buildConsumptionChain([
      read('c', '2026-07-30T07:36:18Z', '14612.5000'),
      read('a', '2026-02-05T07:36:18Z', '12450.0000'),
    ]);

    expect(latestEntry(chain)!.id).toBe('c');
    expect(latestEntry([])).toBeNull();
  });
});

describe('formatDelta', () => {
  it('setzt das Plus nur vor positive Werte', () => {
    // Die alte Detailseite hat `+` fest vorangestellt: aus -387,5 wurde
    // "+-387,5".
    expect(formatDelta(792.5)).toBe('+792,5');
    expect(formatDelta(-387.5)).toBe('-387,5');
    expect(formatDelta(0)).toBe('0');
  });
});

describe('describeImplausibleChain', () => {
  it('schweigt bei einer sauberen Kette', () => {
    const chain = buildConsumptionChain([
      read('a', '2026-05-06T07:36:18Z', '13820.0000'),
      read('b', '2026-07-30T07:36:18Z', '14612.5000'),
    ]);

    expect(describeImplausibleChain(chain)).toBeNull();
  });

  it('nennt Einzahl und Mehrzahl', () => {
    const one = buildConsumptionChain([
      read('a', '2026-06-15T09:00:00Z', '15000.0000'),
      read('b', '2026-07-30T07:36:18Z', '14612.5000'),
    ]);
    expect(describeImplausibleChain(one)).toContain('Eine Ablesung liegt unter');

    const two = buildConsumptionChain([
      read('a', '2026-06-15T09:00:00Z', '15000.0000'),
      read('b', '2026-07-30T07:36:18Z', '14612.5000'),
      read('c', '2026-08-01T07:36:18Z', '14000.0000'),
    ]);
    expect(describeImplausibleChain(two)).toContain('2 Ablesungen liegen unter');
  });
});

describe('checkReadingPlacement', () => {
  const previous = { read_at: '2026-05-06T07:36:18Z', reading: '13820.0000', is_reset: false };
  const next = { read_at: '2026-07-30T07:36:18Z', reading: '14612.5000', is_reset: false };

  it('laesst einen Stand zwischen beiden Nachbarn durch', () => {
    expect(
      checkReadingPlacement({ reading: 14000, isReset: false, previous, next }),
    ).toBeNull();
  });

  it('blockt einen Stand unter dem vorherigen', () => {
    const problem = checkReadingPlacement({
      reading: 13000,
      isReset: false,
      previous,
      next: null,
    });

    expect(problem).toEqual({
      kind: 'below_previous',
      neighbour: 13820,
      neighbourReadAt: '2026-05-06T07:36:18Z',
    });
  });

  it('blockt einen Stand ueber dem nachfolgenden', () => {
    // Der Befund, der auch ohne Query-Fehler wirkt: 15.000 kommt an der
    // alten Pruefung vorbei (13.820 < 15.000) und macht den Juli-Verbrauch
    // negativ.
    const problem = checkReadingPlacement({
      reading: 15000,
      isReset: false,
      previous,
      next,
    });

    expect(problem).toEqual({
      kind: 'above_next',
      neighbour: 14612.5,
      neighbourReadAt: '2026-07-30T07:36:18Z',
    });
  });

  it('meldet den vorherigen Nachbarn zuerst, wenn beide klemmen', () => {
    const problem = checkReadingPlacement({
      reading: 13000,
      isReset: false,
      previous,
      next: { read_at: '2026-07-30T07:36:18Z', reading: '12000.0000', is_reset: false },
    });

    expect(problem!.kind).toBe('below_previous');
  });

  it('gleicher Stand wie der Nachbar ist erlaubt', () => {
    expect(
      checkReadingPlacement({ reading: 13820, isReset: false, previous, next: null }),
    ).toBeNull();
    expect(
      checkReadingPlacement({ reading: 14612.5, isReset: false, previous: null, next }),
    ).toBeNull();
  });

  it('ohne Nachbarn ist jeder Stand zulaessig', () => {
    expect(
      checkReadingPlacement({ reading: 0, isReset: false, previous: null, next: null }),
    ).toBeNull();
  });

  it('ein Zaehlertausch darf unter dem vorherigen Stand liegen', () => {
    expect(
      checkReadingPlacement({ reading: 0, isReset: true, previous, next: null }),
    ).toBeNull();
  });

  it('aber auch nach einem Tausch darf der Stand danach nicht darunter liegen', () => {
    // Ein neuer Zaehler mit Startwert 200, waehrend fuer spaeter schon 150
    // erfasst ist — das kann kein Geraet gelaufen sein.
    const problem = checkReadingPlacement({
      reading: 200,
      isReset: true,
      previous: null,
      next: { read_at: '2026-07-30T07:36:18Z', reading: '150.0000', is_reset: false },
    });

    expect(problem!.kind).toBe('above_next');
  });

  it('ein spaeterer Tausch darf niedriger anfangen', () => {
    expect(
      checkReadingPlacement({
        reading: 14612.5,
        isReset: false,
        previous: null,
        next: { read_at: '2026-08-01T09:00:00Z', reading: '0.0000', is_reset: true },
      }),
    ).toBeNull();
  });

  it('ueberspringt einen Nachbarn mit unlesbarem Wert, statt zu raten', () => {
    expect(
      checkReadingPlacement({
        reading: 100,
        isReset: false,
        previous: { read_at: '2026-05-06T07:36:18Z', reading: 'kaputt', is_reset: false },
        next: null,
      }),
    ).toBeNull();
  });
});

describe('describePlacementProblem', () => {
  it('nennt beide Werte, den Zeitpunkt des Nachbarn und den Ausweg', () => {
    const text = describePlacementProblem(
      { kind: 'below_previous', neighbour: 13820, neighbourReadAt: '2026-05-06T07:36:18Z' },
      13000,
      'kWh',
    );

    expect(text).toContain('13.000 kWh');
    expect(text).toContain('13.820 kWh');
    expect(text).toContain('06.05.2026');
    expect(text).toContain('Reset');
  });

  it('erklaert beim nachfolgenden Nachbarn die Folge', () => {
    const text = describePlacementProblem(
      { kind: 'above_next', neighbour: 14612.5, neighbourReadAt: '2026-07-30T07:36:18Z' },
      15000,
      'kWh',
    );

    expect(text).toContain('nachfolgenden Ablesung');
    expect(text).toContain('negativ');
    expect(text).toContain('14.612,5 kWh');
  });
});

describe('Gegenprobe am echten Bestand', () => {
  it('die sieben Live-Zaehler haben keine einzige unplausible Differenz', () => {
    // Aus der Produktiv-DB am 15.08.2026 (7 Zaehler, 18 Ablesungen, kein
    // Reset). Der Hinweis auf der Detailseite bleibt damit heute still —
    // wie in Sprint 110 ist das eine Aussage ueber die DATEN, nicht ueber
    // den Rechenweg. Der Rechenweg war das Problem.
    const live: ReadingLike[][] = [
      [
        read('a1', '2026-02-05T07:36:18.045Z', '12450.0000'),
        read('a2', '2026-05-06T07:36:18.122Z', '13820.0000'),
        read('a3', '2026-07-30T07:36:18.198Z', '14612.5000'),
      ],
      [
        read('g1', '2026-02-05T07:36:18.493Z', '4820.0000'),
        read('g2', '2026-05-06T07:36:18.575Z', '5610.0000'),
        read('g3', '2026-07-30T07:36:18.653Z', '5990.0000'),
      ],
      [
        read('w1', '2026-05-06T07:36:19.335Z', '88420.0000'),
        read('w2', '2026-07-05T07:36:19.403Z', '91350.0000'),
        read('w3', '2026-08-02T07:36:19.475Z', '93012.0000'),
      ],
      [
        read('k1', '2026-04-06T07:36:20.634Z', '385.2000'),
        read('k2', '2026-08-01T07:36:20.715Z', '402.7000'),
      ],
      [
        read('b1', '2026-06-05T07:36:18.956Z', '128.4000'),
        read('b2', '2026-07-30T07:36:19.031Z', '168.9000'),
      ],
      [
        read('h1', '2026-04-06T07:36:20.163Z', '32450.0000'),
        read('h2', '2026-07-05T07:36:20.232Z', '33210.0000'),
        read('h3', '2026-08-01T07:36:20.306Z', '33580.0000'),
      ],
      [
        read('f1', '2026-05-06T07:36:19.789Z', '210500.0000'),
        read('f2', '2026-08-02T07:36:19.868Z', '224180.0000'),
      ],
    ];

    const chains = live.map(buildConsumptionChain);

    expect(chains.reduce((sum, c) => sum + countImplausible(c), 0)).toBe(0);
    expect(chains.reduce((sum, c) => sum + c.length, 0)).toBe(18);
    expect(chains.every((c) => describeImplausibleChain(c) === null)).toBe(true);

    // Und die Zahl, die heute auf der Detailseite des Allgemeinstromzaehlers
    // steht — die war schon vorher richtig und muss es bleiben.
    expect(latestConsumptionState(chains[0]!)).toEqual({
      kind: 'value',
      delta: 792.5,
      implausible: false,
    });
  });
});
