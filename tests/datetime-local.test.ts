import { describe, expect, it } from 'vitest';
import {
  APP_TIME_ZONE,
  addDaysToKey,
  formatDayKey,
  formatDayShort,
  isoWeekOf,
  localDayRange,
  parseDayKey,
  startOfWeekKey,
  todayKey,
  parseLocalDateTime,
  toLocalDateKey,
  toLocalDateTimeInput,
} from '@/lib/utils/datetime-local';

/**
 * Der Fehler, gegen den diese Tests stehen, ist auf einem Rechner in Berlin
 * unsichtbar: `new Date('2026-08-15T09:00')` liefert dort genau das Richtige.
 * Sichtbar wird er erst auf einem Server in UTC — also in Produktion.
 *
 * Deshalb pruefen diese Tests nicht "kommt irgendein Zeitpunkt heraus",
 * sondern den konkreten UTC-Zeitpunkt. Die Erwartungen sind damit unabhaengig
 * von der Zeitzone des Rechners, auf dem die Suite laeuft.
 */

// So zeigt die App den Zeitpunkt an (identisch zu utils/format.ts).
const berlin = new Intl.DateTimeFormat('de-DE', {
  timeZone: APP_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

describe('parseLocalDateTime', () => {
  it('verankert Sommerzeit-Eingaben als MESZ (UTC+2)', () => {
    expect(parseLocalDateTime('2026-08-15T09:00')).toBe('2026-08-15T07:00:00.000Z');
  });

  it('verankert Winterzeit-Eingaben als MEZ (UTC+1)', () => {
    expect(parseLocalDateTime('2026-01-15T09:00')).toBe('2026-01-15T08:00:00.000Z');
  });

  it('akzeptiert Sekunden und das Leerzeichen-Format', () => {
    expect(parseLocalDateTime('2026-08-15T09:00:30')).toBe('2026-08-15T07:00:30.000Z');
    expect(parseLocalDateTime('2026-08-15 09:00')).toBe('2026-08-15T07:00:00.000Z');
  });

  it('haelt die Silvester-Grenze im richtigen Jahr', () => {
    // 31.12. 23:30 Berlin ist 22:30 UTC am 31.12. — nicht der 01.01.
    const iso = parseLocalDateTime('2026-12-31T23:30');
    expect(iso).toBe('2026-12-31T22:30:00.000Z');
    expect(berlin.format(new Date(iso!))).toBe('31.12.2026, 23:30');
  });

  it('liest denselben Wert unabhaengig von der Prozess-Zeitzone', () => {
    // Genau das kann `new Date(v)` nicht: dort haengt das Ergebnis daran, wie
    // der Server gestartet wurde. Hier ist die Zone ein Argument.
    expect(parseLocalDateTime('2026-08-15T09:00', 'UTC')).toBe('2026-08-15T09:00:00.000Z');
    expect(parseLocalDateTime('2026-08-15T09:00', 'America/New_York')).toBe(
      '2026-08-15T13:00:00.000Z',
    );
  });

  describe('Zeitumstellung', () => {
    // 29.03.2026, 02:00 MEZ -> 03:00 MESZ. Die Stunde 02:00-02:59 gibt es nicht.
    it('schiebt eine nicht existierende Uhrzeit um die Luecke nach vorn', () => {
      const iso = parseLocalDateTime('2026-03-29T02:30');
      expect(iso).toBe('2026-03-29T01:30:00.000Z');
      expect(berlin.format(new Date(iso!))).toBe('29.03.2026, 03:30');
    });

    it('laesst die Stunden rund um die Luecke unangetastet', () => {
      expect(parseLocalDateTime('2026-03-29T01:30')).toBe('2026-03-29T00:30:00.000Z');
      expect(parseLocalDateTime('2026-03-29T04:00')).toBe('2026-03-29T02:00:00.000Z');
    });

    // 25.10.2026, 03:00 MESZ -> 02:00 MEZ. Die Stunde 02:00-02:59 gibt es zweimal.
    it('waehlt bei der doppelten Stunde die erste (noch Sommerzeit)', () => {
      const iso = parseLocalDateTime('2026-10-25T02:30');
      expect(iso).toBe('2026-10-25T00:30:00.000Z');
      // Beide Zeitpunkte zeigen dieselbe Wanduhr-Zeit an — der Unterschied
      // liegt allein im Offset. Der zweite waere 01:30Z gewesen.
      expect(berlin.format(new Date(iso!))).toBe('25.10.2026, 02:30');
      expect(berlin.format(new Date('2026-10-25T01:30:00.000Z'))).toBe('25.10.2026, 02:30');
    });

    it('laesst die Stunden rund um die Doppelung unangetastet', () => {
      expect(parseLocalDateTime('2026-10-25T00:30')).toBe('2026-10-24T22:30:00.000Z');
      expect(parseLocalDateTime('2026-10-25T04:00')).toBe('2026-10-25T03:00:00.000Z');
    });
  });

  describe('unbrauchbare Eingaben', () => {
    it('gibt null zurueck statt zu werfen', () => {
      // Vor diesem Sprint hat `new Date(v).toISOString()` hier eine RangeError
      // geworfen — mitten im Zod-Transform, also an safeParse vorbei und als
      // 500 beim Nutzer. Ein datetime-local-Feld schickt so etwas nicht, ein
      // manuell abgesetztes POST schon.
      for (const bad of ['kaputt', '', '2026-08-15', 'T09:00', '15.08.2026 09:00']) {
        expect(parseLocalDateTime(bad)).toBeNull();
      }
      expect(parseLocalDateTime(null)).toBeNull();
      expect(parseLocalDateTime(undefined)).toBeNull();
    });

    it('lehnt kalendarisch unmoegliche Angaben ab, statt sie weiterzurollen', () => {
      // Date.UTC macht aus dem 31.02. still den 03.03. — ein Datum, das
      // niemand eingegeben hat.
      expect(parseLocalDateTime('2026-02-31T09:00')).toBeNull();
      expect(parseLocalDateTime('2026-13-01T09:00')).toBeNull();
      expect(parseLocalDateTime('2026-08-15T25:00')).toBeNull();
    });

    it('nimmt den 29.02. im Schaltjahr an und im Normaljahr nicht', () => {
      expect(parseLocalDateTime('2028-02-29T09:00')).toBe('2028-02-29T08:00:00.000Z');
      expect(parseLocalDateTime('2026-02-29T09:00')).toBeNull();
    });
  });
});

describe('toLocalDateTimeInput', () => {
  it('zeigt dieselbe Uhrzeit, die die Anzeige nennt', () => {
    expect(toLocalDateTimeInput('2026-08-15T07:00:00.000Z')).toBe('2026-08-15T09:00');
    expect(toLocalDateTimeInput('2026-01-15T08:00:00.000Z')).toBe('2026-01-15T09:00');
  });

  it('bleibt am richtigen Tag, wenn UTC schon einen Tag zurueck ist', () => {
    // 15.08. 00:00 Berlin ist am 14.08. in UTC. Die frueheren Formatierer
    // (toISOString().slice(0,16)) haben hier den Vortag angezeigt.
    expect(toLocalDateTimeInput('2026-08-14T22:00:00.000Z')).toBe('2026-08-15T00:00');
  });

  it('akzeptiert Date-Objekte und faengt Unbrauchbares ab', () => {
    expect(toLocalDateTimeInput(new Date('2026-08-15T07:00:00.000Z'))).toBe('2026-08-15T09:00');
    expect(toLocalDateTimeInput(null)).toBe('');
    expect(toLocalDateTimeInput(undefined)).toBe('');
    expect(toLocalDateTimeInput('kaputt')).toBe('');
  });

  it('ist der Umkehrschluss zu parseLocalDateTime — jede Stunde eines Jahres', () => {
    // Der Roundtrip ist die eigentliche Zusicherung: was ein Formular anzeigt,
    // muss beim Speichern wieder derselbe Zeitpunkt werden. Ginge eine
    // Richtung ueber die Prozess-Zeitzone und die andere ueber Berlin, wuerde
    // jedes Bearbeiten eines Eintrags dessen Uhrzeit verschieben.
    const mismatches: string[] = [];
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 3_600_000) {
      const shown = toLocalDateTimeInput(new Date(t));
      const back = parseLocalDateTime(shown);
      if (back === null || toLocalDateTimeInput(back) !== shown) {
        mismatches.push(`${new Date(t).toISOString()} -> ${shown} -> ${back}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('toLocalDateKey', () => {
  it('gruppiert nach dem Berliner Kalendertag, nicht nach dem UTC-Tag', () => {
    // Ein Eintrag am 16.08. um 00:30 Berlin gehoert in den 16.08. — der
    // UTC-Tag waere der 15.08. gewesen.
    expect(toLocalDateKey('2026-08-15T22:30:00.000Z')).toBe('2026-08-16');
    expect(toLocalDateKey('2026-08-15T21:30:00.000Z')).toBe('2026-08-15');
  });

  it('gibt leer zurueck bei fehlendem Wert', () => {
    expect(toLocalDateKey(null)).toBe('');
  });
});

describe('localDayRange', () => {
  it('deckt den Zeitraum von Mitternacht bis Mitternacht Berliner Zeit ab', () => {
    expect(localDayRange('2026-08-01', '2026-08-31')).toEqual({
      startIso: '2026-07-31T22:00:00.000Z',
      endIso: '2026-08-31T22:00:00.000Z',
    });
  });

  it('deckt einen einzelnen Tag ab', () => {
    expect(localDayRange('2026-08-15', '2026-08-15')).toEqual({
      startIso: '2026-08-14T22:00:00.000Z',
      endIso: '2026-08-15T22:00:00.000Z',
    });
  });

  it('haelt die Grenze ueber den Wechsel Sommer-/Winterzeit hinweg', () => {
    // Oktober beginnt in MESZ (+2) und endet in MEZ (+1). Wer den Zeitraum
    // ueber "+24 Stunden" bildet, verrutscht am Umstellungstag um eine Stunde.
    expect(localDayRange('2026-10-01', '2026-10-31')).toEqual({
      startIso: '2026-09-30T22:00:00.000Z',
      endIso: '2026-10-31T23:00:00.000Z',
    });
  });

  it('rollt ueber Monats- und Jahresgrenzen', () => {
    expect(localDayRange('2026-12-01', '2026-12-31')?.endIso).toBe('2026-12-31T23:00:00.000Z');
    expect(localDayRange('2026-02-01', '2026-02-28')?.endIso).toBe('2026-02-28T23:00:00.000Z');
  });

  it('gibt null zurueck bei unbrauchbaren Datumsangaben', () => {
    expect(localDayRange('kaputt', '2026-08-31')).toBeNull();
    expect(localDayRange('2026-08-01', 'kaputt')).toBeNull();
  });
});

/**
 * Die Tagesschluessel-Helfer sind das zweite Standbein des Sprints: sie
 * ersetzen die Date-Arithmetik, mit der Wochenraster und Zeitraeume gebaut
 * wurden. Auch sie muessen unabhaengig von der Prozess-Zeitzone stimmen,
 * deshalb stehen hier durchgaengig konkrete Kalendertage.
 */
describe('Tagesschluessel', () => {
  it('verschiebt Tage kalendarisch, nicht in 24-Stunden-Bloecken', () => {
    // 25.10.2026 ist der Umstellungssonntag im Herbst und hat 25 Stunden.
    expect(addDaysToKey('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDaysToKey('2026-10-25', 1)).toBe('2026-10-26');
    // 29.03.2026 hat 23 Stunden.
    expect(addDaysToKey('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDaysToKey('2026-03-29', 1)).toBe('2026-03-30');
  });

  it('rollt ueber Monats-, Jahres- und Schaltjahresgrenzen', () => {
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDaysToKey('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysToKey('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('findet den Montag der Woche', () => {
    // 17.08.2026 ist ein Montag.
    expect(startOfWeekKey('2026-08-17')).toBe('2026-08-17');
    expect(startOfWeekKey('2026-08-23')).toBe('2026-08-17'); // Sonntag
    expect(startOfWeekKey('2026-08-18')).toBe('2026-08-17');
    // Ueber die Monatsgrenze zurueck.
    expect(startOfWeekKey('2026-09-02')).toBe('2026-08-31');
  });

  it('bestimmt den heutigen Tag in Berliner Zeit, nicht in UTC', () => {
    // 00:30 Berliner Zeit am 16.08. ist 22:30 UTC am 15.08. — der UTC-Tag
    // waere hier der falsche.
    expect(todayKey(new Date('2026-08-15T22:30:00Z'))).toBe('2026-08-16');
    // Und umgekehrt: 23:30 UTC am 31.12. ist bereits der 01.01. in Berlin.
    expect(todayKey(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });

  it('weist kalendarisch unmoegliche Eingaben zurueck', () => {
    expect(parseDayKey('2026-08-17')).toBe('2026-08-17');
    expect(parseDayKey(' 2026-08-17 ')).toBe('2026-08-17');
    expect(parseDayKey('2026-02-31')).toBeNull();
    expect(parseDayKey('2026-13-01')).toBeNull();
    expect(parseDayKey('17.08.2026')).toBeNull();
    expect(parseDayKey(undefined)).toBeNull();
  });

  it('zaehlt die ISO-Kalenderwoche unabhaengig von der Zone', () => {
    expect(isoWeekOf('2026-01-01')).toBe(1);
    expect(isoWeekOf('2026-08-17')).toBe(34);
    // 03.01.2027 ist ein Sonntag und gehoert nach ISO-8601 noch zur KW 53.
    expect(isoWeekOf('2027-01-03')).toBe(53);
  });

  it('beschriftet einen Tagesschluessel ohne Zonenrechnung', () => {
    expect(formatDayShort('2026-08-17')).toBe('Mo., 17.08.');
    expect(formatDayKey('2026-08-17')).toBe('17.08.2026');
  });

  it('bildet mit localDayRange ein Wochenraster ab Montag', () => {
    const start = startOfWeekKey('2026-08-19');
    expect(start).toBe('2026-08-17');
    expect(localDayRange(start, addDaysToKey(start, 6))).toEqual({
      // Sommerzeit: Berliner Mitternacht ist 22:00 UTC am Vortag.
      startIso: '2026-08-16T22:00:00.000Z',
      endIso: '2026-08-23T22:00:00.000Z',
    });
  });

  it('deckt mit dem Wochenraster genau sieben Berliner Tage ab', () => {
    // Die Woche des Herbst-Umstellungssonntags hat 169 statt 168 Stunden.
    const week = localDayRange('2026-10-19', '2026-10-25');
    const hours =
      (new Date(week!.endIso).getTime() - new Date(week!.startIso).getTime()) / 3_600_000;
    expect(hours).toBe(169);

    // Die Woche der Fruehjahrs-Umstellung hat 167.
    const spring = localDayRange('2026-03-23', '2026-03-29');
    const springHours =
      (new Date(spring!.endIso).getTime() - new Date(spring!.startIso).getTime()) / 3_600_000;
    expect(springHours).toBe(167);
  });

  it('ordnet einen Zeitstempel demselben Tag zu, den das Raster abdeckt', () => {
    // Eine Fruehschicht am Montag um 06:00 Berliner Zeit.
    const shift = parseLocalDateTime('2026-08-17T06:00')!;
    const week = localDayRange('2026-08-17', '2026-08-23')!;
    expect(shift >= week.startIso && shift < week.endIso).toBe(true);
    expect(toLocalDateKey(shift)).toBe('2026-08-17');

    // Und eine Spaetschicht, die um 23:30 endet — noch derselbe Tag.
    const late = parseLocalDateTime('2026-08-23T23:30')!;
    expect(late < week.endIso).toBe(true);
    expect(toLocalDateKey(late)).toBe('2026-08-23');

    // Eine halbe Stunde spaeter beginnt die Folgewoche.
    const nextWeek = parseLocalDateTime('2026-08-24T00:00')!;
    expect(nextWeek >= week.endIso).toBe(true);
  });
});
