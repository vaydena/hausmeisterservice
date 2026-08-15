/**
 * Sprint 109: Fristen — der Unterschied zwischen "laeuft bald ab" und
 * "ist abgelaufen".
 *
 * Anlass sind zwei Befunde, die zusammengehoeren.
 *
 * Der erste ist derselbe verschluckte Query-Fehler wie in den Sprints
 * 103-108: /maintenance und /vehicles laden ihre Liste mit
 * `const { data } = await supabase...`. Faellt die Query aus, stehen alle
 * Zaehler auf 0, der Filter "Ueberfaellig" meldet "Keine ueberfaelligen
 * Wartungen" und im Fuhrpark verschwinden saemtliche TUEV- und
 * Versicherungs-Badges. Das ist die einzige Folge-Klasse in diesem Bogen,
 * die sich nachtraeglich nicht mehr reparieren laesst: eine Zeiterfassung
 * kann man nachtragen, einen verstrichenen Prueftermin nicht.
 *
 * Der zweite Befund faellt erst beim Lesen der bestehenden Anzeige auf.
 * Das abgeloeste `dueTone()` in lib/schemas/vehicles.ts kannte nur drei
 * Stufen und warf "in 10 Tagen faellig" und "seit 16 Tagen abgelaufen" in
 * denselben roten Topf. Die Fuhrpark-Liste fasste beides in einem Satz
 * zusammen: "N mit Frist in <= 60 Tagen". Ein Fahrzeug, dessen HU
 * abgelaufen ist, wurde darin sprachlich zu einem Fahrzeug mit einer
 * kuenftigen Frist — obwohl es nach §29 StVZO in diesem Moment nicht mehr
 * auf die Strasse darf und die Halterhaftung beim Betrieb liegt.
 *
 * Dieses Modul trennt die beiden Zustaende und rechnet dabei in
 * KALENDERTAGEN, nicht in 24-Stunden-Bloecken: `Date.UTC` auf beiden Seiten
 * macht die Differenz unabhaengig von Uhrzeit, Zeitzone und Sommerzeit.
 * Der alte Vergleich ueber `Date.now()` lieferte dagegen fuer einen Termin
 * am selben Tag je nach Tageszeit -1 oder 0.
 *
 * Ein Datum von heute gilt als 'critical', nicht als 'expired': eine Frist,
 * die heute endet, ist heute noch eingehalten.
 */

/** Bis hierher ist eine Frist akut — Werkstatttermin muss stehen. */
export const CRITICAL_WITHIN_DAYS = 14;

/** Bis hierher ist sie in Sichtweite. Entspricht dem Filter "Frist <= 60 Tage". */
export const SOON_WITHIN_DAYS = 60;

export type DeadlineStatus = 'expired' | 'critical' | 'soon' | 'ok' | 'none';

/**
 * Kalendertage bis zum Termin. Negativ = ueberfaellig, 0 = heute.
 * `null` heisst "kein oder kein lesbares Datum" — bewusst derselbe
 * Rueckgabewert, weil beides fuer die Anzeige dasselbe bedeutet: diese
 * Frist wird nicht ueberwacht.
 */
export function daysUntilDeadline(
  dateIso: string | null | undefined,
  now: Date,
): number | null {
  if (!dateIso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateIso.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  if (!year || !month || !day) return null;
  const target = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

export function deadlineStatus(
  dateIso: string | null | undefined,
  now: Date,
): DeadlineStatus {
  const days = daysUntilDeadline(dateIso, now);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= CRITICAL_WITHIN_DAYS) return 'critical';
  if (days <= SOON_WITHIN_DAYS) return 'soon';
  return 'ok';
}

/**
 * Formulierung fuer die Anzeige. Nennt die Richtung explizit — "abgelaufen
 * seit 16 Tagen" ist eine andere Aussage als "16 Tage", und genau die hat
 * bisher gefehlt.
 */
export function describeDeadline(
  dateIso: string | null | undefined,
  now: Date,
): string {
  const days = daysUntilDeadline(dateIso, now);
  if (days === null) return 'kein Termin hinterlegt';
  if (days < 0) return `abgelaufen seit ${-days} ${-days === 1 ? 'Tag' : 'Tagen'}`;
  if (days === 0) return 'heute fällig';
  return `in ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
}

/**
 * Ampel-Farbe zum Zustand. Liegt hier und nicht in der Seite, damit
 * Liste und Detailansicht nicht auseinanderlaufen — dasselbe Muster wie
 * DUE_TONE in lib/schemas/maintenance.ts.
 *
 * 'expired' und 'critical' teilen sich Rot: beides erfordert einen Termin.
 * Den Unterschied traegt der Text (describeDeadline), nicht die Farbe.
 */
export const DEADLINE_TONE: Record<DeadlineStatus, 'danger' | 'warning' | 'muted'> = {
  expired: 'danger',
  critical: 'danger',
  soon: 'warning',
  ok: 'muted',
  none: 'muted',
};

const SEVERITY: Record<DeadlineStatus, number> = {
  expired: 4,
  critical: 3,
  soon: 2,
  ok: 1,
  none: 0,
};

/**
 * Schlimmster Zustand ueber mehrere Fristen desselben Datensatzes.
 * Ein Fahrzeug hat drei (TUEV, Service, Versicherung) und soll in der
 * Uebersicht trotzdem nur einmal gezaehlt werden.
 *
 * 'none' rangiert bewusst UNTER 'ok': eine fehlende Frist ist kein akutes
 * Problem, sondern eine Luecke in der Ueberwachung. Die wird getrennt
 * gemeldet (siehe describeUnmonitored), damit sie nicht in der
 * Faelligkeits-Zaehlung untergeht.
 */
export function worstDeadlineStatus(
  dates: ReadonlyArray<string | null | undefined>,
  now: Date,
): DeadlineStatus {
  let worst: DeadlineStatus = 'none';
  for (const date of dates) {
    const status = deadlineStatus(date, now);
    if (SEVERITY[status] > SEVERITY[worst]) worst = status;
  }
  return worst;
}

export interface DeadlineTally {
  /** Datensaetze mit mindestens einer bereits abgelaufenen Frist. */
  expired: number;
  /** Datensaetze, deren naechste Frist in <= 60 Tagen liegt (inkl. akut). */
  upcoming: number;
}

/**
 * Zaehlt ueber DATENSAETZE, nicht ueber Termine: jedes Element der aeusseren
 * Liste ist ein Datensatz, die innere Liste sind seine Fristen.
 */
export function tallyWorstDeadlines(
  entities: ReadonlyArray<ReadonlyArray<string | null | undefined>>,
  now: Date,
): DeadlineTally {
  let expired = 0;
  let upcoming = 0;
  for (const dates of entities) {
    const worst = worstDeadlineStatus(dates, now);
    if (worst === 'expired') expired += 1;
    else if (worst === 'critical' || worst === 'soon') upcoming += 1;
  }
  return { expired, upcoming };
}

/**
 * Kurztext fuer den Seitenkopf. Das Abgelaufene steht vorn und wird nie
 * mit dem Kuenftigen verrechnet — das war der eigentliche Fehler in
 * "N mit Frist in <= 60 Tagen".
 */
export function describeDeadlineTally(tally: DeadlineTally): string | null {
  const parts: string[] = [];
  if (tally.expired > 0) parts.push(`${tally.expired} abgelaufen`);
  if (tally.upcoming > 0) parts.push(`${tally.upcoming} mit Frist in ≤ ${SOON_WITHIN_DAYS} Tagen`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export interface OverdueSummary {
  /** Betrachtete Datensaetze insgesamt. */
  total: number;
  /** Davon ueberfaellig. */
  overdue: number;
  /** Tage, die der aelteste ueberfaellige Datensatz zurueckliegt. */
  worstDays: number;
  /** Bezeichnung dieses Datensatzes, damit die Meldung handlungsfaehig ist. */
  worstLabel: string | null;
}

export function summarizeOverdue(
  items: ReadonlyArray<{ dueAt: string | null | undefined; label: string }>,
  now: Date,
): OverdueSummary {
  let overdue = 0;
  let worstDays = 0;
  let worstLabel: string | null = null;
  for (const item of items) {
    const days = daysUntilDeadline(item.dueAt, now);
    if (days === null || days >= 0) continue;
    overdue += 1;
    if (-days > worstDays) {
      worstDays = -days;
      worstLabel = item.label;
    }
  }
  return { total: items.length, overdue, worstDays, worstLabel };
}

export function describeOverdue(summary: OverdueSummary): string | null {
  if (summary.overdue === 0) return null;
  const worst =
    summary.worstLabel !== null
      ? `, der älteste seit ${summary.worstDays} ${summary.worstDays === 1 ? 'Tag' : 'Tagen'} („${summary.worstLabel}“)`
      : '';
  return (
    `${summary.overdue} von ${summary.total} Plänen ${summary.overdue === 1 ? 'ist' : 'sind'} ` +
    `überfällig${worst}. Prüffristen laufen weiter, auch wenn niemand diese Liste öffnet.`
  );
}

/**
 * Fuer Datensaetze, bei denen eine Frist gar nicht erst hinterlegt ist.
 * Die sind gefaehrlicher als eine ueberfaellige Frist, weil sie in KEINER
 * Fristen-Ansicht auftauchen: ohne Datum kein Bucket, kein Badge, kein
 * Zaehler. Sie fallen erst bei der Kontrolle auf.
 *
 * Singular/Plural kommt vom Aufrufer, weil deutsche Mehrzahlbildung sich
 * nicht aus einem Wort ableiten laesst (Fahrzeug/Fahrzeuge, Anhaenger/
 * Anhaenger).
 */
export function describeUnmonitored(
  count: number,
  forms: { one: string; many: string },
  deadline: string,
): string | null {
  if (count <= 0) return null;
  const subject = count === 1 ? forms.one : forms.many;
  const tauchen = count === 1 ? 'taucht' : 'tauchen';
  return (
    `${count} ${subject} ohne hinterlegte ${deadline}: ${tauchen} in keiner ` +
    `Fristenübersicht auf und ${count === 1 ? 'wird' : 'werden'} nie gewarnt.`
  );
}
