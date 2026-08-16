/**
 * Wanduhr-Zeiten (`<input type="datetime-local">`) verlaesslich in einen
 * Zeitpunkt umrechnen — und zurueck.
 *
 * Ein datetime-local-Feld liefert "2026-08-15T09:00", also eine Uhrzeit ohne
 * jede Zonenangabe. Wer daraus einen Zeitpunkt machen will, muss sagen, in
 * welcher Zone diese Uhrzeit gilt. Der Code hat das bisher nicht gesagt,
 * sondern auf zwei Wegen implizit beantwortet:
 *
 *   1. `new Date('2026-08-15T09:00').toISOString()` — ECMAScript liest einen
 *      Wert ohne Suffix als Lokalzeit des *ausfuehrenden Prozesses*. Auf einem
 *      Server in UTC wird aus 09:00 damit 09:00Z, angezeigt als 11:00.
 *   2. Den Rohstring direkt an Postgres geben — der liest ihn in der
 *      *Session-Zeitzone*, und die ist bei Supabase UTC. Gleiche Verschiebung,
 *      nur eine Schicht tiefer, und anders als (1) unabhaengig davon, wo die
 *      App laeuft.
 *
 * Angezeigt wird dagegen ueberall mit `timeZone: 'Europe/Berlin'` (siehe
 * `format.ts`). Weg (1) und die Anzeige stimmen nur ueberein, solange der
 * Server zufaellig auf Berlin steht; Weg (2) stimmt nie.
 *
 * Deshalb hier die Zone explizit. Der Nutzer tippt Berliner Zeit, also wird
 * sie als Berliner Zeit verankert — egal, wo der Prozess laeuft und egal, wie
 * die Datenbank-Session eingestellt ist.
 */

/**
 * Die eine Zone, in der diese Anwendung Wanduhr-Zeiten deutet. Bewusst eine
 * Konstante und keine Konfiguration: die Anzeige in `format.ts` ist ebenfalls
 * fest auf Berlin, und zwei Stellen mit derselben Annahme sind genau die
 * Konstellation, aus der dieser Fehler entstanden ist.
 */
export const APP_TIME_ZONE = 'Europe/Berlin';

const DAY_MS = 86_400_000;

/** "2026-08-15T09:00", "2026-08-15T09:00:30" oder mit Leerzeichen statt T. */
const WALLCLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

const partsCache = new Map<string, Intl.DateTimeFormat>();

function zoneParts(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      // h23 statt hour12:false — sonst liefern manche Engines "24" fuer
      // Mitternacht und der Roundtrip kippt um einen Tag.
      hourCycle: 'h23',
    });
    partsCache.set(timeZone, fmt);
  }
  return fmt;
}

/**
 * Die Wanduhr-Zeit, die dieser Zeitpunkt in der Zone zeigt — kodiert als
 * "als waere sie UTC". Nur zum Rechnen; nie nach aussen geben.
 */
function wallclockOf(instantMs: number, timeZone: string): number {
  const p = zoneParts(timeZone).formatToParts(new Date(instantMs));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(p.find((part) => part.type === type)?.value ?? '0');
  return Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
}

function offsetAt(instantMs: number, timeZone: string): number {
  return wallclockOf(instantMs, timeZone) - instantMs;
}

/**
 * Wanduhr-Zeit aus einem datetime-local-Feld → ISO-Zeitpunkt (UTC).
 * Gibt `null` zurueck, wenn der Wert nicht als Wanduhr-Zeit lesbar ist —
 * geworfen wird nie, damit Zod-Transforms den Fehler als Feldfehler
 * behandeln koennen statt als 500.
 *
 * Zeitumstellung: der Offset der Zone haengt vom Zeitpunkt ab, den wir gerade
 * erst suchen. Deshalb zwei Kandidaten — einer mit dem Offset des Vortags,
 * einer mit dem des Folgetags — und genommen wird der, der zurueckgerechnet
 * wieder dieselbe Wanduhr-Zeit ergibt.
 *
 *   - Normalfall: beide Kandidaten identisch.
 *   - Doppelte Stunde (letzter Sonntag im Oktober, 02:00-02:59 gibt es
 *     zweimal): beide gueltig, genommen wird der fruehere — also noch
 *     Sommerzeit. Das entspricht der Konvention von Temporal und Luxon.
 *   - Fehlende Stunde (letzter Sonntag im Maerz, 02:00-02:59 gibt es nicht):
 *     keiner gueltig, genommen wird der erste Kandidat. Der schiebt die
 *     Eingabe um die Luecke nach vorn, 02:30 wird also 03:30. Auch das ist
 *     die uebliche Konvention; wichtiger ist, dass ein Formular mit einer
 *     nicht existierenden Uhrzeit nicht kommentarlos irgendwo landet.
 */
export function parseLocalDateTime(
  value: string | null | undefined,
  timeZone: string = APP_TIME_ZONE,
): string | null {
  if (typeof value !== 'string') return null;
  const m = WALLCLOCK_RE.exec(value.trim());
  if (!m) return null;

  const wallclock = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    m[6] ? Number(m[6]) : 0,
  );
  if (Number.isNaN(wallclock)) return null;

  // Kalendarisch unmoegliche Angaben (31.02., 25:00) rollt Date.UTC still
  // weiter. Das waere ein anderer Tag als der eingegebene, also ablehnen.
  const rolled = new Date(wallclock);
  if (
    rolled.getUTCFullYear() !== Number(m[1]) ||
    rolled.getUTCMonth() !== Number(m[2]) - 1 ||
    rolled.getUTCDate() !== Number(m[3]) ||
    rolled.getUTCHours() !== Number(m[4]) ||
    rolled.getUTCMinutes() !== Number(m[5])
  ) {
    return null;
  }

  const candidateA = wallclock - offsetAt(wallclock - DAY_MS, timeZone);
  if (wallclockOf(candidateA, timeZone) === wallclock) {
    return new Date(candidateA).toISOString();
  }
  const candidateB = wallclock - offsetAt(wallclock + DAY_MS, timeZone);
  if (wallclockOf(candidateB, timeZone) === wallclock) {
    return new Date(candidateB).toISOString();
  }
  return new Date(candidateA).toISOString();
}

/**
 * ISO-Zeitpunkt → Wert fuer ein datetime-local-Feld ("yyyy-MM-ddTHH:mm").
 * Gegenstueck zu `parseLocalDateTime`: was das Formular anzeigt, ist damit
 * dieselbe Uhrzeit, die `formatDateTime` daneben ausgibt.
 *
 * Leerer String bei fehlendem oder unlesbarem Wert — ein datetime-local-Feld
 * mit ungueltigem `defaultValue` zeigt sonst gar nichts an, ohne dass jemand
 * merkt, warum.
 */
export function toLocalDateTimeInput(
  iso: string | Date | null | undefined,
  timeZone: string = APP_TIME_ZONE,
): string {
  if (iso === null || iso === undefined) return '';
  const ms = typeof iso === 'string' ? new Date(iso).getTime() : iso.getTime();
  if (Number.isNaN(ms)) return '';
  const wallclock = new Date(wallclockOf(ms, timeZone));
  return wallclock.toISOString().slice(0, 16);
}

/**
 * ISO-Zeitpunkt → Kalendertag in der Zone ("yyyy-MM-dd").
 *
 * `toISOString().slice(0, 10)` liefert den UTC-Tag: ein Eintrag vom 16.08.
 * 00:30 Berlin steht dort unter dem 15.08. Fuer Tagesgruppierungen und
 * Tagessummen ist das der falsche Tag.
 */
export function toLocalDateKey(
  iso: string | Date | null | undefined,
  timeZone: string = APP_TIME_ZONE,
): string {
  return toLocalDateTimeInput(iso, timeZone).slice(0, 10);
}

/**
 * Kalendertag ("yyyy-MM-dd") → Zeitpunkt, an dem dieser Tag in der Zone
 * beginnt bzw. der naechste beginnt. Fuer Zeitraum-Filter: `[start, end)`
 * deckt den Tag genau ab, ohne dass die Grenzen um den Zonen-Offset
 * verrutschen.
 */
export function localDayRange(
  fromDate: string,
  toDate: string,
  timeZone: string = APP_TIME_ZONE,
): { startIso: string; endIso: string } | null {
  const startIso = parseLocalDateTime(`${fromDate}T00:00`, timeZone);
  if (startIso === null) return null;

  // Ende exklusiv: Beginn des Folgetags. Der Folgetag wird im Kalender
  // gesucht, nicht ueber "+24 Stunden" — an den Umstellungssonntagen hat der
  // Tag 23 bzw. 25 Stunden, und die Grenze wuerde um eine Stunde verrutschen.
  const nextDay = addDaysToKey(toDate.trim(), 1);
  if (nextDay === toDate.trim()) return null;

  const endIso = parseLocalDateTime(`${nextDay}T00:00`, timeZone);
  return endIso === null ? null : { startIso, endIso };
}

/**
 * Ein Kalendertag als "yyyy-MM-dd".
 *
 * Zeitraeume, Wochen und Tagesgruppen wurden bisher mit `Date`-Objekten
 * gerechnet — ueber `setHours(0,0,0,0)` und `getDay()`, also ueber die
 * Zeitzone des Node-Prozesses. Auf einem Server in UTC verschiebt das die
 * Wochengrenze (Montag beginnt um 02:00 Berliner Zeit, die ersten beiden
 * Stunden fallen aus dem Raster) und die Zuordnung eines Zeitstempels zu
 * seinem Tag (ein Eintrag um 00:30 landet beim Vortag).
 *
 * Ein Tagesschluessel hat diese Mehrdeutigkeit nicht: "2026-08-17" ist ein
 * Kalendertag, keine Zeitzonenfrage. Nur an den Raendern — beim Umrechnen in
 * einen Zeitpunkt (`localDayRange`) und beim Zuordnen eines Zeitpunkts
 * (`toLocalDateKey`) — wird die Zone gebraucht, und dort steht sie explizit.
 */
export type DayKey = string;

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Heutiger Kalendertag in der App-Zone. */
export function todayKey(now: Date = new Date(), timeZone: string = APP_TIME_ZONE): DayKey {
  return toLocalDateKey(now, timeZone);
}

/** Tagesschluessel aus einem URL-Parameter, oder `null` wenn unbrauchbar. */
export function parseDayKey(input: string | undefined | null): DayKey | null {
  if (!input) return null;
  const trimmed = input.trim();
  const m = DAY_KEY_RE.exec(trimmed);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // Kalendarisch unmoegliche Angaben (31.02.) rollt Date.UTC still weiter.
  return d.toISOString().slice(0, 10) === trimmed ? trimmed : null;
}

/** Tagesschluessel um `days` Kalendertage verschieben. */
export function addDaysToKey(key: DayKey, days: number): DayKey {
  const m = DAY_KEY_RE.exec(key);
  if (!m) return key;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return Number.isNaN(d.getTime()) ? key : d.toISOString().slice(0, 10);
}

/** Montag der Woche, in der dieser Tag liegt. */
export function startOfWeekKey(key: DayKey): DayKey {
  const m = DAY_KEY_RE.exec(key);
  if (!m) return key;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // getUTCDay(): 0 = Sonntag. Die Woche beginnt hier am Montag.
  return addDaysToKey(key, -((d.getUTCDay() + 6) % 7));
}

/**
 * ISO-8601 Kalenderwoche (Woche beginnt Montag, erste Woche mit mindestens
 * vier Tagen). Rechnet auf dem Tagesschluessel, damit die angezeigte KW nicht
 * an der Prozess-Zeitzone haengt.
 */
export function isoWeekOf(key: DayKey): number {
  const m = DAY_KEY_RE.exec(key);
  if (!m) return 0;
  const target = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  target.setUTCDate(target.getUTCDate() + 3 - ((target.getUTCDay() + 6) % 7));
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
}

const DAY_SHORT = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  // Der Schluessel ist ein reines Kalenderdatum; als UTC-Mitternacht kodiert
  // muss er auch als UTC formatiert werden, sonst rutscht die Beschriftung
  // in Zonen westlich von Greenwich auf den Vortag.
  timeZone: 'UTC',
});

/** "Mo, 17.08." — Beschriftung eines Tages. */
export function formatDayShort(key: DayKey): string {
  const m = DAY_KEY_RE.exec(key);
  if (!m) return key;
  return DAY_SHORT.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
}

const DAY_LONG = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "17.08.2026" — ein Tagesschluessel als volles Datum. */
export function formatDayKey(key: DayKey): string {
  const m = DAY_KEY_RE.exec(key);
  if (!m) return key;
  return DAY_LONG.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
}
