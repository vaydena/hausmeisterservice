/**
 * Sprint 108: Ein Zeiteintrag ohne `end_at` ist ueberall null Minuten wert.
 *
 * Das ist keine Randnotiz, sondern die Folge, die den verschluckten
 * Query-Fehler in `punchOutAction` so teuer macht. Der Ablauf:
 *
 *   1. Der Mitarbeiter drueckt "Ausstempeln". Die Query nach dem offenen
 *      Eintrag scheitert, `const { data: open }` verliert den Fehler, und die
 *      Action antwortet "Es laeuft aktuell keine offene Zeit."
 *   2. Der Eintrag bleibt mit `end_at NULL` liegen.
 *   3. Ab hier zaehlt er nirgends mehr mit: die Wochensumme auf
 *      /time-tracking filtert auf `e.end_at`, der Zeitbericht und der
 *      CSV-Export fuer die Lohnabrechnung filtern in der Query selbst mit
 *      `.not('end_at', 'is', null)`. Die Stunden sind nicht falsch berechnet
 *      — sie sind gar nicht erst da.
 *
 * Und niemand sieht es: Die Auswertung nennt eine Stundenzahl ohne jeden
 * Hinweis darauf, dass Eintraege fehlen. Der Mitarbeiter sieht seinen
 * Eintrag zwar mit dem Badge "laeuft" in der eigenen Wochenliste, aber
 * nichts sagt ihm, dass genau dieses "laeuft" ihn den Tag kostet.
 *
 * Arbeitszeit ist Lohngrundlage und aufzeichnungspflichtig — §16 Abs. 2 ArbZG
 * fuer die ueber acht Stunden hinausgehende Zeit (zwei Jahre aufzubewahren),
 * seit dem BAG-Beschluss vom 13.09.2022 (1 ABR 22/21) darueber hinaus die
 * gesamte Arbeitszeit ueber § 3 Abs. 2 Nr. 1 ArbSchG. Eine Auswertung, die
 * zu wenig ausweist und das nicht kenntlich macht, ist deshalb nicht nur
 * unpraktisch.
 *
 * Dieses Modul macht den Zustand sichtbar, statt ihn zu verhindern: es
 * schliesst keinen Eintrag automatisch. Wann ein Arbeitstag geendet hat,
 * weiss nur der Mensch, der ihn gearbeitet hat — geraten wird hier nichts,
 * es wird nur gesagt, dass etwas fehlt.
 */

/**
 * Ab wann ein laufender Eintrag nicht mehr plausibel "laeuft", sondern
 * vergessen wurde. Zwoelf Stunden liegen bewusst ueber jeder regulaeren
 * Schicht inklusive Ueberstunden, damit die Warnung waehrend eines langen,
 * aber echten Arbeitstages nicht schon mittags erscheint.
 */
export const STALE_OPEN_AFTER_HOURS = 12;

export interface UnclosedEntryLike {
  start_at: string;
  end_at: string | null;
  /**
   * Optional — nur noetig, wenn die Meldung "bei N Mitarbeitern" nennen soll.
   * Ob das die user_id oder die employee_id ist, entscheidet der Aufrufer;
   * hier zaehlt allein, dass zwei Eintraege derselben Person denselben Wert
   * tragen.
   */
  person_id?: string | null;
}

/** Laufzeit eines offenen Eintrags in Stunden (nie negativ). */
export function openHours(startIso: string, now: Date): number {
  const ms = now.getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, ms / 3_600_000);
}

/** Laeuft der Eintrag laenger, als ein Arbeitstag plausibel dauert? */
export function isStaleOpenEntry(startIso: string, now: Date): boolean {
  return openHours(startIso, now) >= STALE_OPEN_AFTER_HOURS;
}

/**
 * Hinweis fuer den Mitarbeiter zu seiner eigenen laufenden Zeit. `null`,
 * solange die Zeit plausibel laeuft — eine Warnung, die bei jeder normalen
 * Schicht erscheint, wird nach drei Tagen nicht mehr gelesen.
 */
export function describeOwnOpenEntry(startIso: string, now: Date): string | null {
  if (!isStaleOpenEntry(startIso, now)) return null;
  const hours = Math.floor(openHours(startIso, now));
  return (
    `Diese Zeit läuft seit ${hours} Stunden. Solange kein Ende erfasst ist, ` +
    `zählt sie weder in Ihrer Wochensumme noch im Zeitbericht oder im ` +
    `Lohn-Export mit. Bitte ausstempeln oder das Ende nachtragen.`
  );
}

export interface UnclosedSummary {
  /** Offene Eintraege im betrachteten Bestand. */
  count: number;
  /** Davon laenger offen als STALE_OPEN_AFTER_HOURS. */
  staleCount: number;
  /** Betroffene Mitarbeiter, sofern person_id mitgeliefert wurde. */
  personCount: number;
  /** Aeltester offener Eintrag — die Spitze des Problems. */
  oldestStartAt: string | null;
}

export function summarizeUnclosedEntries(
  entries: ReadonlyArray<UnclosedEntryLike>,
  now: Date,
): UnclosedSummary {
  const open = entries.filter((e) => e.end_at === null);
  const persons = new Set<string>();
  let oldest: string | null = null;

  for (const e of open) {
    if (e.person_id) persons.add(e.person_id);
    if (oldest === null || new Date(e.start_at).getTime() < new Date(oldest).getTime()) {
      oldest = e.start_at;
    }
  }

  return {
    count: open.length,
    staleCount: open.filter((e) => isStaleOpenEntry(e.start_at, now)).length,
    personCount: persons.size,
    oldestStartAt: oldest,
  };
}

/**
 * Ein Satz fuer Auswertung und Export. `null`, wenn nichts fehlt — dann
 * steht auch kein leerer Kasten auf der Seite.
 *
 * Die Formulierung nennt bewusst die Folge ("fehlen in dieser Auswertung")
 * und nicht nur den Befund ("N offene Eintraege"). Wer eine Lohnabrechnung
 * aus diesen Zahlen macht, muss wissen, dass die Summe zu niedrig ist.
 */
export function describeUnclosedEntries(summary: UnclosedSummary): string | null {
  if (summary.count === 0) return null;
  const eintrag = summary.count === 1 ? 'Eintrag hat' : 'Einträge haben';
  const person =
    summary.personCount > 1 ? ` bei ${summary.personCount} Mitarbeitern` : '';
  return (
    `${summary.count} ${eintrag}${person} kein erfasstes Ende und fehlen ` +
    `deshalb vollständig in dieser Auswertung — die ausgewiesene Stundenzahl ` +
    `ist zu niedrig.`
  );
}
