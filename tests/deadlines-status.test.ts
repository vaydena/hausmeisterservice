import { describe, it, expect } from 'vitest';
import {
  CRITICAL_WITHIN_DAYS,
  SOON_WITHIN_DAYS,
  daysUntilDeadline,
  deadlineStatus,
  describeDeadline,
  describeDeadlineTally,
  describeOverdue,
  describeUnmonitored,
  summarizeOverdue,
  tallyWorstDeadlines,
  worstDeadlineStatus,
} from '@/lib/deadlines/status';

/**
 * Sprint 109: Gegenprobe zum verschluckten Query-Fehler in /maintenance und
 * /vehicles. Die Zahlen in den Faellen unten sind der echte Stand der
 * Produktiv-DB am 15.08.2026 — drei ueberfaellige Wartungsplaene und ein
 * LKW, dessen HU seit dem 30.07. abgelaufen ist.
 *
 * `NOW` wird ueber den lokalen Konstruktor gebaut, nicht ueber einen
 * UTC-String: geprueft werden Kalendertage, und die haengen an der lokalen
 * Zeitzone des Servers.
 */
const NOW = new Date(2026, 7, 15, 12, 0, 0);

describe('daysUntilDeadline', () => {
  it('zählt Kalendertage bis zum Termin', () => {
    expect(daysUntilDeadline('2026-09-18', NOW)).toBe(34);
  });

  it('zählt überfällige Termine negativ', () => {
    // DÜ-HM 200, HU am 30.07.2026.
    expect(daysUntilDeadline('2026-07-30', NOW)).toBe(-16);
  });

  it('gibt für heute 0 zurück', () => {
    expect(daysUntilDeadline('2026-08-15', NOW)).toBe(0);
  });

  it('ist unabhängig von der Uhrzeit', () => {
    // Der abgelöste dueTone()-Vergleich über Date.now() lieferte für einen
    // Termin am selben Tag je nach Tageszeit -1 oder 0. Genau das soll hier
    // nicht passieren.
    const frueh = new Date(2026, 7, 15, 0, 30, 0);
    const spaet = new Date(2026, 7, 15, 23, 30, 0);
    expect(daysUntilDeadline('2026-08-20', frueh)).toBe(5);
    expect(daysUntilDeadline('2026-08-20', spaet)).toBe(5);
  });

  it('akzeptiert auch einen vollen Zeitstempel', () => {
    expect(daysUntilDeadline('2026-08-20T00:00:00+00:00', NOW)).toBe(5);
  });

  it('gibt null zurück, wenn kein Datum hinterlegt ist', () => {
    expect(daysUntilDeadline(null, NOW)).toBeNull();
    expect(daysUntilDeadline(undefined, NOW)).toBeNull();
    expect(daysUntilDeadline('', NOW)).toBeNull();
  });

  it('gibt bei unlesbarem Datum null zurück statt NaN', () => {
    expect(daysUntilDeadline('demnächst', NOW)).toBeNull();
  });
});

describe('deadlineStatus', () => {
  it('trennt abgelaufen von akut', () => {
    expect(deadlineStatus('2026-08-14', NOW)).toBe('expired');
    expect(deadlineStatus('2026-08-16', NOW)).toBe('critical');
  });

  it('behandelt den heutigen Tag als eingehalten', () => {
    // Eine Frist, die heute endet, ist heute noch eingehalten.
    expect(deadlineStatus('2026-08-15', NOW)).toBe('critical');
  });

  it('schaltet an den dokumentierten Schwellen um', () => {
    // Bewusst NICHT ueber toISOString(): das rechnet nach UTC um und
    // verschiebt oestlich von Greenwich den Kalendertag um eins.
    const inTagen = (n: number) => {
      const d = new Date(2026, 7, 15 + n);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${d.getFullYear()}-${mm}-${dd}`;
    };
    expect(deadlineStatus(inTagen(CRITICAL_WITHIN_DAYS), NOW)).toBe('critical');
    expect(deadlineStatus(inTagen(CRITICAL_WITHIN_DAYS + 1), NOW)).toBe('soon');
    expect(deadlineStatus(inTagen(SOON_WITHIN_DAYS), NOW)).toBe('soon');
    expect(deadlineStatus(inTagen(SOON_WITHIN_DAYS + 1), NOW)).toBe('ok');
  });

  it('meldet eine fehlende Frist als eigenen Zustand', () => {
    // Nicht 'ok': ohne Datum wird nichts überwacht.
    expect(deadlineStatus(null, NOW)).toBe('none');
  });
});

describe('describeDeadline', () => {
  it('nennt die Richtung, nicht nur die Zahl', () => {
    expect(describeDeadline('2026-07-30', NOW)).toBe('abgelaufen seit 16 Tagen');
    expect(describeDeadline('2026-09-18', NOW)).toBe('in 34 Tagen');
  });

  it('beugt den Einzeltag korrekt', () => {
    expect(describeDeadline('2026-08-14', NOW)).toBe('abgelaufen seit 1 Tag');
    expect(describeDeadline('2026-08-16', NOW)).toBe('in 1 Tag');
  });

  it('formuliert den heutigen Tag eigens', () => {
    expect(describeDeadline('2026-08-15', NOW)).toBe('heute fällig');
  });

  it('sagt bei fehlendem Datum, dass nichts hinterlegt ist', () => {
    expect(describeDeadline(null, NOW)).toBe('kein Termin hinterlegt');
  });
});

describe('worstDeadlineStatus', () => {
  it('nimmt die schlimmste Frist eines Datensatzes', () => {
    // DÜ-HM 200: HU abgelaufen, Service in 19 Tagen, Versicherung in 139.
    expect(worstDeadlineStatus(['2026-07-30', '2026-09-03', '2027-01-01'], NOW)).toBe('expired');
  });

  it('lässt eine fehlende Frist nicht als Warnung durchgehen', () => {
    expect(worstDeadlineStatus([null, '2027-08-19'], NOW)).toBe('ok');
  });

  it('meldet none nur, wenn gar nichts hinterlegt ist', () => {
    expect(worstDeadlineStatus([null, undefined], NOW)).toBe('none');
  });

  it('kommt mit einer leeren Liste aus', () => {
    expect(worstDeadlineStatus([], NOW)).toBe('none');
  });
});

describe('tallyWorstDeadlines', () => {
  // Der echte Fuhrpark am 15.08.2026.
  const fuhrpark = [
    ['2026-09-18', '2026-12-02', '2027-02-20'], // DÜ-HM 100 · TÜV in 34 T.
    ['2026-07-30', '2026-09-03', '2027-01-01'], // DÜ-HM 200 · TÜV abgelaufen
    ['2027-08-19', '2026-11-02', '2026-09-13'], // DÜ-HM 300 · Vers. in 29 T.
    ['2027-04-21', null, '2027-05-31'], // DÜ-HM 400 · alles fern
    [null, '2026-08-14', null], // DÜ-HM 500 · Service überfällig
  ];

  it('zählt Datensätze, nicht Termine', () => {
    // DÜ-HM 200 hat eine abgelaufene und zwei künftige Fristen und darf
    // trotzdem nur einmal auftauchen.
    expect(tallyWorstDeadlines(fuhrpark, NOW)).toEqual({ expired: 2, upcoming: 2 });
  });

  it('rechnet Abgelaufenes nicht in die künftigen Fristen ein', () => {
    const tally = tallyWorstDeadlines([['2026-07-30']], NOW);
    expect(tally.expired).toBe(1);
    expect(tally.upcoming).toBe(0);
  });

  it('meldet bei leerem Bestand nichts', () => {
    expect(tallyWorstDeadlines([], NOW)).toEqual({ expired: 0, upcoming: 0 });
  });
});

describe('describeDeadlineTally', () => {
  it('stellt das Abgelaufene voran', () => {
    expect(describeDeadlineTally({ expired: 1, upcoming: 3 })).toBe(
      '1 abgelaufen · 3 mit Frist in ≤ 60 Tagen',
    );
  });

  it('nennt nur, was es gibt', () => {
    expect(describeDeadlineTally({ expired: 2, upcoming: 0 })).toBe('2 abgelaufen');
    expect(describeDeadlineTally({ expired: 0, upcoming: 2 })).toBe(
      '2 mit Frist in ≤ 60 Tagen',
    );
  });

  it('schweigt, wenn nichts ansteht', () => {
    expect(describeDeadlineTally({ expired: 0, upcoming: 0 })).toBeNull();
  });
});

describe('summarizeOverdue', () => {
  // Der echte Stand der Wartungspläne am 15.08.2026.
  const plaene = [
    { dueAt: '2026-07-30', label: 'Rauchmelder-Prüfung' },
    { dueAt: '2026-08-04', label: 'Grünpflege Innenhof' },
    { dueAt: '2026-08-07', label: 'Aufzug – Monatliche Sichtprüfung' },
    { dueAt: '2026-08-23', label: 'Heizung – Jahreswartung' },
    { dueAt: '2026-09-16', label: 'Filterwechsel Lüftungsanlage' },
  ];

  it('zählt die überfälligen Pläne', () => {
    const summary = summarizeOverdue(plaene, NOW);
    expect(summary.total).toBe(5);
    expect(summary.overdue).toBe(3);
  });

  it('benennt den ältesten überfälligen Plan', () => {
    // Ohne Namen ist die Meldung nicht handlungsfähig — man müsste die
    // Liste durchsuchen, um zu wissen, was liegen geblieben ist.
    const summary = summarizeOverdue(plaene, NOW);
    expect(summary.worstDays).toBe(16);
    expect(summary.worstLabel).toBe('Rauchmelder-Prüfung');
  });

  it('ignoriert Pläne ohne Datum, statt sie als überfällig zu zählen', () => {
    const summary = summarizeOverdue([{ dueAt: null, label: 'ohne Termin' }], NOW);
    expect(summary.overdue).toBe(0);
    expect(summary.worstLabel).toBeNull();
  });

  it('meldet bei lauter aktuellen Plänen nichts', () => {
    const summary = summarizeOverdue([{ dueAt: '2026-08-23', label: 'Heizung' }], NOW);
    expect(summary).toEqual({ total: 1, overdue: 0, worstDays: 0, worstLabel: null });
  });
});

describe('describeOverdue', () => {
  it('nennt Zahl, Alter und Namen', () => {
    const text = describeOverdue({
      total: 5,
      overdue: 3,
      worstDays: 16,
      worstLabel: 'Rauchmelder-Prüfung',
    });
    expect(text).toContain('3 von 5');
    expect(text).toContain('16 Tagen');
    expect(text).toContain('Rauchmelder-Prüfung');
  });

  it('sagt, dass die Frist unabhängig von der Anzeige weiterläuft', () => {
    // Der Punkt der ganzen Meldung: eine leere Liste ist kein Beweis für
    // einen leeren Terminkalender.
    const text =
      describeOverdue({ total: 5, overdue: 3, worstDays: 16, worstLabel: 'X' }) ?? '';
    expect(text).toContain('laufen weiter');
  });

  it('beugt den Einzelfall korrekt', () => {
    const text = describeOverdue({ total: 4, overdue: 1, worstDays: 1, worstLabel: 'X' }) ?? '';
    expect(text).toContain('1 von 4 Plänen ist überfällig');
    expect(text).toContain('seit 1 Tag ');
  });

  it('schweigt, wenn nichts überfällig ist', () => {
    expect(describeOverdue({ total: 5, overdue: 0, worstDays: 0, worstLabel: null })).toBeNull();
  });
});

describe('describeUnmonitored', () => {
  it('sagt, dass diese Datensätze in keiner Übersicht auftauchen', () => {
    const text = describeUnmonitored(2, { one: 'Fahrzeug', many: 'Fahrzeuge' }, 'TÜV-Frist') ?? '';
    expect(text).toContain('2 Fahrzeuge ohne hinterlegte TÜV-Frist');
    expect(text).toContain('keiner Fristenübersicht');
  });

  it('beugt den Einzelfall korrekt', () => {
    const text = describeUnmonitored(1, { one: 'Fahrzeug', many: 'Fahrzeuge' }, 'TÜV-Frist') ?? '';
    expect(text).toContain('1 Fahrzeug ohne');
    expect(text).toContain('taucht');
  });

  it('schweigt, wenn alle Fristen gepflegt sind', () => {
    expect(describeUnmonitored(0, { one: 'Fahrzeug', many: 'Fahrzeuge' }, 'TÜV-Frist')).toBeNull();
  });
});
