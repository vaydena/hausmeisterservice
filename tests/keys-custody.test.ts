import { describe, it, expect } from 'vitest';
import {
  CUSTODY_TONE,
  EMPTY_CUSTODY,
  RETURN_DUE_SOON_HOURS,
  computeCustody,
  custodyByKey,
  describeCustodyAge,
  describeCustodyTally,
  describeOverdueReturns,
  describeReturnStatus,
  describeUnmonitoredCustody,
  expectsReturnDate,
  tallyCustody,
  worstCustodyStatus,
  type HandoverLike,
} from '@/lib/keys/custody';

/**
 * Sprint 110.
 *
 * Anders als bei den Prueffristen (Sprint 109) sind hier beide Seiten des
 * Vergleichs Instants — happened_at und expected_return_at sind timestamptz.
 * Die Zeitzone des Testlaufs spielt deshalb keine Rolle, und die
 * toISOString()-Falle aus 109 (Kalendertag verschiebt sich oestlich von
 * Greenwich) kann hier nicht zuschlagen.
 */
const NOW = new Date('2026-08-15T12:00:00.000Z');

let seq = 0;
function issue(overrides: Partial<HandoverLike> = {}): HandoverLike {
  seq += 1;
  return {
    id: `issue-${seq}`,
    kind: 'issue',
    copies_count: 1,
    issue_handover_id: null,
    happened_at: '2026-08-01T08:00:00.000Z',
    expected_return_at: null,
    holder_kind: 'employee',
    ...overrides,
  };
}

function ret(issueId: string, copies = 1, overrides: Partial<HandoverLike> = {}): HandoverLike {
  seq += 1;
  return {
    id: `return-${seq}`,
    kind: 'return',
    copies_count: copies,
    issue_handover_id: issueId,
    happened_at: '2026-08-10T08:00:00.000Z',
    expected_return_at: null,
    holder_kind: null,
    ...overrides,
  };
}

describe('computeCustody — Exemplare statt Vorgaenge', () => {
  it('zaehlt eine offene Ausgabe vollstaendig als draussen', () => {
    const a = issue({ copies_count: 2 });
    const custody = computeCustody([a], NOW);

    expect(custody.issuedCopies).toBe(2);
    expect(custody.returnedCopies).toBe(0);
    expect(custody.outstandingCopies).toBe(2);
    expect(custody.openIssues).toHaveLength(1);
  });

  it('schliesst eine vollstaendig zurueckgegebene Ausgabe', () => {
    const a = issue({ copies_count: 2 });
    const custody = computeCustody([a, ret(a.id, 2)], NOW);

    expect(custody.outstandingCopies).toBe(0);
    expect(custody.openIssues).toEqual([]);
  });

  /**
   * Der Kern von Sprint 110. Die abgeloeste Fassung baute ein Set aus
   * issue_handover_id und behandelte die Ausgabe als erledigt, sobald
   * IRGENDEIN Rueckgabe-Vorgang darauf verwies. Drei ausgegeben, eines
   * zurueck, und die Seite meldete "3/3 im Bestand" — waehrend zwei
   * Exemplare draussen waren.
   */
  it('laesst nach einer Teilrueckgabe den Rest offen', () => {
    const a = issue({ copies_count: 3 });
    const custody = computeCustody([a, ret(a.id, 1)], NOW);

    expect(custody.issuedCopies).toBe(3);
    expect(custody.returnedCopies).toBe(1);
    expect(custody.outstandingCopies).toBe(2);
    expect(custody.openIssues).toHaveLength(1);
    expect(custody.openIssues[0]?.outstandingCopies).toBe(2);
    expect(custody.openIssues[0]?.returnedCopies).toBe(1);
    expect(custody.openIssues[0]?.issuedCopies).toBe(3);
  });

  /**
   * Auf issue_handover_id liegt ein normaler Index, kein Unique-Index —
   * mehrere Rueckgaben zu einer Ausgabe sind erlaubt und muessen sich
   * addieren. Ohne das waere die Teilrueckgabe eine Sackgasse: das
   * Formular erscheint nur unter offenen Ausgaben.
   */
  it('addiert mehrere Teilrueckgaben zur selben Ausgabe', () => {
    const a = issue({ copies_count: 3 });
    const custody = computeCustody([a, ret(a.id, 1), ret(a.id, 2)], NOW);

    expect(custody.returnedCopies).toBe(3);
    expect(custody.outstandingCopies).toBe(0);
    expect(custody.openIssues).toEqual([]);
  });

  it('kappt eine Ueberrueckgabe statt negativ zu werden', () => {
    // Die Datenbank prueft copies_count nur einzeln auf > 0 und kennt
    // keine Regel ueber die Vorgangsgrenze hinweg.
    const a = issue({ copies_count: 1 });
    const custody = computeCustody([a, ret(a.id, 5)], NOW);

    expect(custody.returnedCopies).toBe(1);
    expect(custody.outstandingCopies).toBe(0);
  });

  it('ignoriert eine Rueckgabe ohne Bezug zu einer Ausgabe', () => {
    // FK auf issue_handover_id steht auf ON DELETE SET NULL.
    const a = issue({ copies_count: 1 });
    const orphan = ret(a.id, 1, { issue_handover_id: null });
    const custody = computeCustody([a, orphan], NOW);

    expect(custody.outstandingCopies).toBe(1);
  });

  it('liefert fuer eine leere Historie denselben Nullzustand wie EMPTY_CUSTODY', () => {
    expect(computeCustody([], NOW)).toEqual(EMPTY_CUSTODY);
  });

  it('sortiert offene Ausgaben mit der aeltesten zuerst', () => {
    const neu = issue({ happened_at: '2026-08-12T08:00:00.000Z' });
    const alt = issue({ happened_at: '2026-07-20T08:00:00.000Z' });
    const custody = computeCustody([neu, alt], NOW);

    expect(custody.openIssues.map((i) => i.issueId)).toEqual([alt.id, neu.id]);
  });

  it('ignoriert andere Vorgangsarten in der Bestandsrechnung', () => {
    // 'lost', 'retired' und 'replaced' aendern den Status bzw. die
    // Gesamtzahl des Schluessels, aber nicht, wer gerade ein Exemplar haelt.
    const a = issue({ copies_count: 1 });
    const custody = computeCustody(
      [a, { ...issue(), kind: 'lost' }, { ...issue(), kind: 'replaced' }],
      NOW,
    );

    expect(custody.issuedCopies).toBe(1);
    expect(custody.outstandingCopies).toBe(1);
  });
});

describe('Rueckgabe-Zustand — Instants, keine Kalendertage', () => {
  it('ist ueberfaellig, sobald der Zeitpunkt vorbei ist — nicht erst um Mitternacht', () => {
    // Genau der Unterschied zu daysUntilDeadline() aus lib/deadlines/status.ts:
    // dort waere "heute 11:59" noch Tag 0 und damit nicht abgelaufen.
    const a = issue({ expected_return_at: '2026-08-15T11:59:00.000Z' });
    const [open] = computeCustody([a], NOW).openIssues;

    expect(open?.status).toBe('overdue');
    expect(open?.overdueDays).toBe(0);
    expect(describeReturnStatus(open!)).toBe('Rückgabe seit heute überfällig');
  });

  it('nennt volle Tage, sobald mehr als 24 Stunden vergangen sind', () => {
    const a = issue({ expected_return_at: '2026-08-11T12:00:00.000Z' });
    const [open] = computeCustody([a], NOW).openIssues;

    expect(open?.status).toBe('overdue');
    expect(open?.overdueDays).toBe(4);
    expect(describeReturnStatus(open!)).toBe('Rückgabe überfällig seit 4 Tagen');
  });

  it('nutzt den Singular bei genau einem Tag', () => {
    const a = issue({ expected_return_at: '2026-08-14T11:00:00.000Z' });
    const [open] = computeCustody([a], NOW).openIssues;

    expect(describeReturnStatus(open!)).toBe('Rückgabe überfällig seit 1 Tag');
  });

  it('meldet eine Rueckgabe innerhalb der naechsten 48 Stunden als anstehend', () => {
    const a = issue({ expected_return_at: '2026-08-16T12:00:00.000Z' });
    const [open] = computeCustody([a], NOW).openIssues;

    expect(RETURN_DUE_SOON_HOURS).toBe(48);
    expect(open?.status).toBe('due_soon');
    expect(describeReturnStatus(open!)).toBe('Rückgabe steht an');
  });

  it('laesst einen Termin weiter in der Zukunft unkommentiert', () => {
    const a = issue({ expected_return_at: '2026-09-03T07:21:45.361Z' });
    const [open] = computeCustody([a], NOW).openIssues;

    expect(open?.status).toBe('open');
    // Das Datum steht ohnehin daneben — ein zweiter Satz waere Rauschen.
    expect(describeReturnStatus(open!)).toBeNull();
  });

  it('behandelt einen unlesbaren Zeitstempel wie kein Datum', () => {
    const a = issue({ expected_return_at: 'demnächst', holder_kind: 'external' });
    const [open] = computeCustody([a], NOW).openIssues;

    expect(open?.status).toBe('unmonitored');
  });
});

describe('fehlendes Rueckgabedatum — nur bei Externen eine Luecke', () => {
  it('erwartet ein Datum ausschliesslich von externen Empfaengern', () => {
    expect(expectsReturnDate('external')).toBe(true);
    expect(expectsReturnDate('employee')).toBe(false);
    expect(expectsReturnDate('resident')).toBe(false);
    expect(expectsReturnDate('owner')).toBe(false);
    expect(expectsReturnDate(null)).toBe(false);
    expect(expectsReturnDate(undefined)).toBe(false);
  });

  it('wertet den Schluessel eines Mitarbeiters ohne Datum als dauerhafte Ausgabe', () => {
    // Der Hausmeister hat den Haupteingang. Wuerde das warnen, waere die
    // Warnung binnen einer Woche wertlos.
    const a = issue({ holder_kind: 'employee', expected_return_at: null });
    const [open] = computeCustody([a], NOW).openIssues;

    expect(open?.status).toBe('standing');
    expect(describeReturnStatus(open!)).toBe('dauerhafte Ausgabe');
    expect(CUSTODY_TONE[open!.status]).toBe('muted');
  });

  it('meldet den Schluessel eines Externen ohne Datum als unueberwacht', () => {
    const a = issue({ holder_kind: 'external', expected_return_at: null });
    const [open] = computeCustody([a], NOW).openIssues;

    expect(open?.status).toBe('unmonitored');
    expect(describeReturnStatus(open!)).toBe('kein Rückgabedatum hinterlegt');
    expect(CUSTODY_TONE[open!.status]).toBe('warning');
  });
});

describe('describeCustodyAge', () => {
  it('nennt Menge und Dauer', () => {
    const a = issue({ copies_count: 2, happened_at: '2026-08-03T07:21:44.329Z' });
    const [open] = computeCustody([a], NOW).openIssues;

    expect(describeCustodyAge(open!)).toBe('2 Exemplare seit 12 Tagen draußen');
  });

  it('nennt nach einer Teilrueckgabe beide Zahlen', () => {
    const a = issue({ copies_count: 3, happened_at: '2026-08-13T12:00:00.000Z' });
    const [open] = computeCustody([a, ret(a.id, 1)], NOW).openIssues;

    expect(describeCustodyAge(open!)).toBe('noch 2 von 3 Exemplaren seit 2 Tagen draußen');
  });

  it('verwendet Singular und "seit heute"', () => {
    const a = issue({ copies_count: 1, happened_at: '2026-08-15T09:00:00.000Z' });
    const [open] = computeCustody([a], NOW).openIssues;

    expect(describeCustodyAge(open!)).toBe('1 Exemplar seit heute draußen');
  });
});

describe('worstCustodyStatus', () => {
  it('gibt null zurueck, wenn nichts draussen ist', () => {
    expect(worstCustodyStatus(EMPTY_CUSTODY)).toBeNull();
  });

  it('setzt ueberfaellig ueber unueberwacht ueber anstehend', () => {
    const dauerhaft = issue({ holder_kind: 'employee' });
    const ohneDatum = issue({ holder_kind: 'external' });
    const anstehend = issue({ expected_return_at: '2026-08-16T12:00:00.000Z' });
    const ueberfaellig = issue({ expected_return_at: '2026-08-01T12:00:00.000Z' });

    expect(worstCustodyStatus(computeCustody([dauerhaft], NOW))).toBe('standing');
    expect(worstCustodyStatus(computeCustody([dauerhaft, anstehend], NOW))).toBe('due_soon');
    expect(worstCustodyStatus(computeCustody([dauerhaft, anstehend, ohneDatum], NOW))).toBe(
      'unmonitored',
    );
    expect(
      worstCustodyStatus(computeCustody([dauerhaft, anstehend, ohneDatum, ueberfaellig], NOW)),
    ).toBe('overdue');
  });
});

describe('custodyByKey', () => {
  it('trennt die Bestaende der einzelnen Schluessel', () => {
    const a = { ...issue({ copies_count: 2 }), key_id: 'key-a' };
    const b = { ...issue({ copies_count: 1 }), key_id: 'key-b' };
    const map = custodyByKey([a, b, { ...ret(b.id, 1), key_id: 'key-b' }], NOW);

    expect(map.get('key-a')?.outstandingCopies).toBe(2);
    expect(map.get('key-b')?.outstandingCopies).toBe(0);
    // Schluessel ohne jede Ausgabe kommen gar nicht erst vor — die Seite
    // faellt dafuer auf EMPTY_CUSTODY zurueck.
    expect(map.has('key-c')).toBe(false);
  });

  it('ordnet eine Rueckgabe ueber issue_handover_id zu, nicht ueber key_id', () => {
    // Kein Constraint verlangt, dass Rueckgabe und Ausgabe dieselbe key_id
    // tragen. Die Zuordnung laeuft deshalb ueber den gesamten Eingabesatz.
    const a = { ...issue({ copies_count: 2 }), key_id: 'key-a' };
    const falscheGruppe = { ...ret(a.id, 2), key_id: 'key-b' };
    const map = custodyByKey([a, falscheGruppe], NOW);

    expect(map.get('key-a')?.outstandingCopies).toBe(0);
  });
});

describe('tallyCustody + Meldetexte', () => {
  /** Der Live-Stand am 15.08.2026 in der Produktiv-Datenbank. */
  function liveBestand() {
    const haupteingang = issue({
      id: 'e9b9fbb1',
      copies_count: 2,
      happened_at: '2026-08-03T07:21:44.329Z',
      holder_kind: 'employee',
      expected_return_at: null,
    });
    const ladenlokal = issue({
      id: 'd6c0899f',
      copies_count: 1,
      happened_at: '2026-08-03T07:21:45.361Z',
      holder_kind: 'external',
      expected_return_at: '2026-09-03T07:21:45.361Z',
    });
    const haustuer = issue({ id: 'e2316581', copies_count: 1 });
    const transponder = issue({ id: 'ce756830', copies_count: 1 });

    return [
      { label: 'Haupteingang Haus A', custody: computeCustody([haupteingang], NOW) },
      { label: 'Ladenlokal EG-01', custody: computeCustody([ladenlokal], NOW) },
      { label: 'Haustürschlüssel Haupthaus', custody: computeCustody([haustuer, ret('e2316581', 1)], NOW) },
      { label: 'Tiefgaragen-Transponder', custody: computeCustody([transponder, ret('ce756830', 1)], NOW) },
      { label: 'Kellerzugang K-01', custody: EMPTY_CUSTODY },
    ];
  }

  it('zaehlt den echten Bestand richtig', () => {
    const tally = tallyCustody(liveBestand());

    expect(tally.keysOut).toBe(2);
    expect(tally.copiesOut).toBe(3);
    expect(tally.longestDaysOut).toBe(12);
  });

  it('meldet fuer den echten Bestand heute weder ueberfaellig noch unueberwacht', () => {
    // Wichtig als Gegenprobe: die beiden Panels sind heute still, weil die
    // DATEN in Ordnung sind — der Rechenweg war es nicht. Schlaegt dieser
    // Test irgendwann an, hat sich die Klassifizierung verschoben.
    const tally = tallyCustody(liveBestand());

    expect(tally.overdueIssues).toBe(0);
    expect(tally.unmonitoredIssues).toBe(0);
    expect(describeOverdueReturns(tally)).toBeNull();
    expect(describeUnmonitoredCustody(tally)).toBeNull();
    expect(describeCustodyTally(tally)).toBe('3 Exemplare ausgegeben');
  });

  it('schweigt vollstaendig, wenn nichts draussen ist', () => {
    const tally = tallyCustody([{ label: 'Torschlüssel Einfahrt', custody: EMPTY_CUSTODY }]);

    expect(tally.keysOut).toBe(0);
    expect(describeCustodyTally(tally)).toBeNull();
  });

  it('haengt ueberfaellige Rueckgaben an den Kopftext an', () => {
    const spaet = issue({ copies_count: 1, expected_return_at: '2026-08-01T12:00:00.000Z' });
    const tally = tallyCustody([{ label: 'Ladenlokal EG-01', custody: computeCustody([spaet], NOW) }]);

    expect(describeCustodyTally(tally)).toBe('1 Exemplar ausgegeben · 1 Rückgabe überfällig');
    expect(describeOverdueReturns(tally)).toContain('1 Ausgabe hat');
  });

  it('formuliert die Mehrzahl bei mehreren ueberfaelligen Rueckgaben', () => {
    const a = issue({ expected_return_at: '2026-08-01T12:00:00.000Z' });
    const b = issue({ expected_return_at: '2026-08-02T12:00:00.000Z' });
    const tally = tallyCustody([
      { label: 'A', custody: computeCustody([a], NOW) },
      { label: 'B', custody: computeCustody([b], NOW) },
    ]);

    expect(describeCustodyTally(tally)).toBe('2 Exemplare ausgegeben · 2 Rückgaben überfällig');
    expect(describeOverdueReturns(tally)).toContain('2 Ausgaben haben');
  });

  it('meldet unueberwachte Ausgaben an Externe in beiden Numeri', () => {
    const einer = tallyCustody([
      { label: 'A', custody: computeCustody([issue({ holder_kind: 'external' })], NOW) },
    ]);
    expect(describeUnmonitoredCustody(einer)).toBe(
      '1 offene Ausgabe an einen Externen ohne Rückgabedatum: sie wird nie überfällig und taucht in keiner Erinnerung auf.',
    );

    const zwei = tallyCustody([
      { label: 'A', custody: computeCustody([issue({ holder_kind: 'external' })], NOW) },
      { label: 'B', custody: computeCustody([issue({ holder_kind: 'external' })], NOW) },
    ]);
    expect(describeUnmonitoredCustody(zwei)).toBe(
      '2 offene Ausgaben an Externe ohne Rückgabedatum: sie werden nie überfällig und tauchen in keiner Erinnerung auf.',
    );
  });

  it('nennt den Schluessel, der am laengsten draussen ist', () => {
    const kurz = issue({ happened_at: '2026-08-14T12:00:00.000Z' });
    const lang = issue({ happened_at: '2026-06-15T12:00:00.000Z' });
    const tally = tallyCustody([
      { label: 'Kellerzugang K-01', custody: computeCustody([kurz], NOW) },
      { label: 'Haupteingang Haus A', custody: computeCustody([lang], NOW) },
    ]);

    expect(tally.longestDaysOut).toBe(61);
    expect(tally.longestLabel).toBe('Haupteingang Haus A');
  });
});
