import { formatDateTime } from '@/lib/utils/format';

/**
 * Sprint 111: Verbrauch aus Zaehlerstaenden — und die Regel, dass ein Zaehler
 * nicht rueckwaerts laeuft.
 *
 * Zwei Befunde haben dieses Modul ausgeloest.
 *
 * 1. addReadingAction las den letzten Stand ohne Fehlerpruefung:
 *
 *        const { data: last } = await supabase...
 *        if (last && Number(last.reading) > parsed.data.reading) throw ...
 *
 *    supabase-js wirft nicht. Faellt die Query aus, ist `last` null, die
 *    Bedingung damit false — und die Pruefung bricht nicht ab, sie faellt
 *    aus. Ein rueckwaerts laufender Stand landet kommentarlos in der
 *    Tabelle. Dieselbe Umkehrung wie beim Km-Stand in Sprint 109, nur ist
 *    die Differenz zweier Zaehlerstaende der VERBRAUCH, und der steht in der
 *    Betriebskostenabrechnung.
 *
 * 2. Die Regel war auch bei fehlerfreier Datenbank nur halb durchgesetzt.
 *    Geprueft wurde ausschliesslich gegen den Stand DAVOR
 *    (`.lte('read_at', readIso).order(desc).limit(1)`). Dass Ablesungen
 *    nachgetragen werden, war also eingeplant — nur in eine Richtung. Wer
 *    zwischen 13.820 (Mai) und 14.612,5 (Juli) einen vergessenen Juni-Stand
 *    von 15.000 nachtraegt, kommt durch: 13.820 ist kleiner als 15.000. Der
 *    Juli-Wert bekommt dadurch einen Verbrauch von -387,5 kWh. Die
 *    Fehlermeldung der Regel beschreibt exakt den Zustand, den das System
 *    danach hat — sie hat nur nie in diese Richtung geschaut.
 *
 * Deshalb prueft checkReadingPlacement() BEIDE Nachbarn.
 *
 * Zum Datentyp: meter_readings.reading ist NUMERIC(14,4) und kommt als
 * STRING aus PostgREST ("14612.5000"), obwohl der generierte Typ `number`
 * sagt. Jede Zahl laeuft deshalb durch parseReading() — mit null als
 * Fehlerwert, nicht mit 0. Ein `Number(x) || 0` waere genau der Fehler, den
 * dieses Modul verhindern soll: es macht aus "unbekannt" einen Zaehlerstand.
 */

/** Nachkommastellen der Spalte NUMERIC(14,4) — Deltas werden ebenso gerundet. */
const SCALE = 4;

/**
 * NUMERIC-Wert aus PostgREST in eine Zahl.
 *
 * Bewusst null statt 0 im Fehlerfall: 0 ist ein gueltiger Zaehlerstand (ein
 * frisch getauschter Zaehler startet dort), und ein stiller 0-Fallback wuerde
 * in jeder Differenz als Verbrauch in Hoehe des Vorgaengerstands auftauchen.
 */
export function parseReading(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Unlesbare Zeitstempel ans Ende sortieren, ohne NaN in den Vergleich zu tragen. */
function instant(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function round(value: number): number {
  return Number(value.toFixed(SCALE));
}

function formatReading(value: number): string {
  return value.toLocaleString('de-DE', { maximumFractionDigits: SCALE });
}

export interface ReadingLike {
  id: string;
  read_at: string;
  reading: number | string;
  is_reset: boolean;
}

export interface ConsumptionEntry {
  id: string;
  readAt: string;
  reading: number;
  isReset: boolean;
  /**
   * Verbrauch seit der vorherigen Ablesung. null heisst "nicht berechenbar":
   * erste Ablesung der Reihe, oder Zaehlertausch — nach einem Tausch ist die
   * Differenz zum Vorgaengerstand kein Verbrauch, sondern der Sprung zwischen
   * zwei verschiedenen Geraeten.
   */
  delta: number | null;
  /** delta < 0 — der Zaehler ist zwischen zwei Ablesungen rueckwaerts gelaufen. */
  implausible: boolean;
}

/**
 * Chronologisch aufsteigende Kette mit Verbrauch pro Ablesung.
 *
 * Sortiert selbst und verlaesst sich nicht auf die Reihenfolge des Aufrufers:
 * die Listenseite laedt absteigend, die Detailseite ebenso, und ein
 * nachgetragener Stand kann ohnehin zwischen zwei bestehenden liegen. Gleiche
 * read_at innerhalb eines Zaehlers kann es nicht geben — dafuer sorgt
 * UNIQUE (meter_id, read_at).
 *
 * Eine Zeile mit unlesbarem Zaehlerstand faellt aus der Kette. Unter NUMERIC
 * NOT NULL ist das nicht erreichbar; waere es das, ist die Zeile wegzulassen
 * immer noch besser, als mit ihr eine Differenz zu bilden.
 */
export function buildConsumptionChain(readings: ReadingLike[]): ConsumptionEntry[] {
  const parsed = readings
    .map((r) => ({ row: r, value: parseReading(r.reading) }))
    .filter((x): x is { row: ReadingLike; value: number } => x.value !== null)
    .sort((a, b) => instant(a.row.read_at) - instant(b.row.read_at));

  const chain: ConsumptionEntry[] = [];
  let previous: number | null = null;

  for (const { row, value } of parsed) {
    const delta = previous !== null && !row.is_reset ? round(value - previous) : null;
    chain.push({
      id: row.id,
      readAt: row.read_at,
      reading: value,
      isReset: row.is_reset,
      delta,
      implausible: delta !== null && delta < 0,
    });
    previous = value;
  }

  return chain;
}

/** Die neueste Ablesung der Kette (letztes Element), oder null. */
export function latestEntry(chain: ReadonlyArray<ConsumptionEntry>): ConsumptionEntry | null {
  return chain.length > 0 ? chain[chain.length - 1]! : null;
}

export type ConsumptionState =
  | { kind: 'none' }
  | { kind: 'insufficient' }
  | { kind: 'after_reset' }
  | { kind: 'value'; delta: number; implausible: boolean };

/**
 * Was auf der Karte "Letzter Verbrauch" steht. Die drei Leerfaelle sind
 * bewusst unterscheidbar: "noch keine Ablesung", "nur eine Ablesung" und
 * "letzte Ablesung war ein Zaehlertausch" sind fuer den Nutzer verschiedene
 * Situationen mit verschiedenen naechsten Schritten.
 */
export function latestConsumptionState(chain: ReadonlyArray<ConsumptionEntry>): ConsumptionState {
  const latest = latestEntry(chain);
  if (!latest) return { kind: 'none' };
  if (latest.isReset) return { kind: 'after_reset' };
  if (latest.delta === null) return { kind: 'insufficient' };
  return { kind: 'value', delta: latest.delta, implausible: latest.implausible };
}

export function countImplausible(chain: ReadonlyArray<ConsumptionEntry>): number {
  return chain.reduce((sum, e) => sum + (e.implausible ? 1 : 0), 0);
}

/**
 * Hinweistext fuer eine Kette, in der ein Zaehler rueckwaerts gelaufen ist.
 * Solche Werte kann die Plausibilitaetsregel seit diesem Sprint nicht mehr
 * entstehen lassen — bestehende Zeilen raeumt sie aber nicht auf, und
 * unbemerkt landen sie in der naechsten Abrechnung.
 */
export function describeImplausibleChain(chain: ReadonlyArray<ConsumptionEntry>): string | null {
  const count = countImplausible(chain);
  if (count === 0) return null;
  return count === 1
    ? 'Eine Ablesung liegt unter ihrem Vorgänger — der Verbrauch dazwischen ist negativ. Bitte Wert oder Ablesezeitpunkt prüfen; bei einem Zählertausch gehört die Ablesung als „Reset" markiert.'
    : `${count} Ablesungen liegen unter ihrem jeweiligen Vorgänger — der Verbrauch dazwischen ist negativ. Bitte Werte oder Ablesezeitpunkte prüfen; bei einem Zählertausch gehört die Ablesung als „Reset" markiert.`;
}

/**
 * Verbrauch mit Vorzeichen. Die alte Detailseite hat `+` fest vorangestellt,
 * was einen negativen Verbrauch als "+-387,5" ausgab — ein Zustand, den die
 * Anzeige gar nicht vorgesehen hatte.
 */
export function formatDelta(delta: number): string {
  return delta > 0 ? `+${formatReading(delta)}` : formatReading(delta);
}

export interface NeighbourReading {
  read_at: string;
  reading: number | string;
  is_reset: boolean;
}

export type PlacementProblem =
  | { kind: 'below_previous'; neighbour: number; neighbourReadAt: string }
  | { kind: 'above_next'; neighbour: number; neighbourReadAt: string };

/**
 * Darf dieser Stand zu diesem Zeitpunkt stehen?
 *
 * Beide Richtungen, weil eine Ablesung nachgetragen werden kann:
 *
 *  - gegen den Stand DAVOR, ausser bei einem Zaehlertausch — ein neuer
 *    Zaehler faengt niedriger an, das ist der Sinn des Reset-Hakens.
 *  - gegen den Stand DANACH, auch bei einem Zaehlertausch: nach dem Tausch
 *    darf kein spaeterer Stand unter dem Startwert liegen. Ausgenommen ist
 *    nur ein spaeterer Tausch, der selbst wieder niedriger anfangen darf.
 *
 * Ein Nachbar mit unlesbarem Wert wird uebersprungen statt geraten. Unter
 * NUMERIC NOT NULL ist das nicht erreichbar.
 */
export function checkReadingPlacement(input: {
  reading: number;
  isReset: boolean;
  previous: NeighbourReading | null;
  next: NeighbourReading | null;
}): PlacementProblem | null {
  const { reading, isReset, previous, next } = input;

  if (!isReset && previous) {
    const value = parseReading(previous.reading);
    if (value !== null && value > reading) {
      return { kind: 'below_previous', neighbour: value, neighbourReadAt: previous.read_at };
    }
  }

  if (next && !next.is_reset) {
    const value = parseReading(next.reading);
    if (value !== null && value < reading) {
      return { kind: 'above_next', neighbour: value, neighbourReadAt: next.read_at };
    }
  }

  return null;
}

export function describePlacementProblem(
  problem: PlacementProblem,
  reading: number,
  unit: string,
): string {
  const own = `${formatReading(reading)} ${unit}`;
  const other = `${formatReading(problem.neighbour)} ${unit}`;
  const when = formatDateTime(problem.neighbourReadAt);

  if (problem.kind === 'below_previous') {
    return `Neuer Stand (${own}) liegt unter der vorherigen Ablesung vom ${when} (${other}). Bei einem Zählertausch bitte „Reset" markieren.`;
  }
  return `Neuer Stand (${own}) liegt über der nachfolgenden Ablesung vom ${when} (${other}). Damit wäre der Verbrauch danach negativ — bitte Wert und Ablesezeitpunkt prüfen.`;
}
