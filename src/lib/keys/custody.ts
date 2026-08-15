/**
 * Sprint 110: Schluesselgewalt — wer haelt gerade welchen Schluessel.
 *
 * Anlass sind zwei Befunde. Nur der erste gehoert in die Reihe 103-109.
 *
 * Der erste ist derselbe verschluckte Query-Fehler. /keys rekonstruiert den
 * ausgegebenen Bestand aus ZWEI getrennten Abfragen — allen 'issue'- und
 * allen 'return'-Vorgaengen — und beide standen als `const { data }` ohne
 * Fehlerpruefung da. Die kippen in ENTGEGENGESETZTE Richtungen: faellt die
 * Ausgaben-Abfrage aus, ist der ausgegebene Bestand 0 und jeder Schluessel
 * sieht vollzaehlig im Kasten aus; faellt die Rueckgaben-Abfrage aus, gilt
 * jede jemals erfolgte Ausgabe wieder als offen. Die erste Richtung ist die
 * gefaehrliche, weil sie beruhigt.
 *
 * Auf der Detailseite haengt daran mehr als eine Anzeige. `totalOut` steuert
 * dort drei Entscheidungen: ob das Ausgabe-Formular erscheint, ob "Aktuell
 * sind keine Exemplare ausgegeben" dasteht — und ob "Schluessel entfernen"
 * freigeschaltet wird, dessen eigener Hinweistext lautet "Nur moeglich, wenn
 * keine Exemplare ausgegeben sind". Ein verschluckter Lesefehler beantwortet
 * also nicht nur eine Frage falsch, er oeffnet die Schranke, die genau auf
 * diese Antwort gesetzt ist. Das ist dieselbe Umkehrung wie beim Km-Stand in
 * Sprint 109, nur mit einem Loeschknopf am Ende.
 *
 * Der zweite Befund steckt in der Zaehlweise selbst und wirkt auch bei
 * voellig fehlerfreier Datenbank. Beide Seiten haben eine Ausgabe als
 * erledigt behandelt, sobald IRGENDEIN Rueckgabe-Vorgang auf sie verwies —
 * ohne die Exemplare zu zaehlen:
 *
 *     const returnedIds = new Set(returns.map((r) => r.issue_handover_id));
 *     if (!returnedIds.has(iss.id)) ...
 *
 * Das Rueckgabe-Formular bietet aber ausdruecklich Teilrueckgaben an
 * (min 1, max = ausgegebene Anzahl), und die Datenbank erlaubt mehrere
 * Rueckgaben zu einer Ausgabe: auf `issue_handover_id` liegt ein normaler
 * Index, kein Unique-Index. Wer von drei ausgegebenen Exemplaren eines
 * zuruecknahm, las danach "3/3 im Bestand" und "Aktuell sind keine Exemplare
 * ausgegeben" — und das Rueckgabe-Formular fuer die restlichen zwei
 * verschwand, weil es nur unter offenen Ausgaben gerendert wird. Die zwei
 * Exemplare waren damit draussen UND im System nicht mehr zurueckzugeben.
 *
 * Dieses Modul zaehlt deshalb EXEMPLARE statt Vorgaenge.
 *
 * Zur Zeitrechnung: anders als die Prueffristen aus Sprint 109 ist
 * `expected_return_at` kein Datum, sondern ein Zeitstempel (timestamptz,
 * erfasst ueber ein datetime-local-Feld). "Rueckgabe bis Donnerstag 18:00"
 * ist um 18:01 ueberfaellig und nicht erst um Mitternacht. Hier wird deshalb
 * mit Instants verglichen und bewusst NICHT daysUntilDeadline() aus
 * lib/deadlines/status.ts wiederverwendet — das rundet absichtlich auf
 * Kalendertage und waere an dieser Stelle das falsche Werkzeug.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Ab hier gilt eine Rueckgabe als unmittelbar bevorstehend. */
export const RETURN_DUE_SOON_HOURS = 48;

/**
 * Empfaengertypen, bei denen ein fehlendes Rueckgabedatum eine Luecke ist.
 *
 * Nur 'external'. Ein Mitarbeiter, ein Bewohner oder ein Eigentuemer haelt
 * seinen Schluessel dauerhaft — der Hausmeister hat den Haupteingang, die
 * Mieterin ihre Wohnung. Ein Rueckgabedatum zu verlangen wuerde dort bei
 * jeder zweiten Ausgabe anschlagen und die Warnung binnen einer Woche
 * wertlos machen (dieselbe Ueberlegung wie needsRoadDeadlines() in
 * lib/schemas/vehicles.ts: eine Motorsaege ohne TUEV-Datum ist gepflegt,
 * nicht unueberwacht).
 *
 * Ein Externer dagegen — Handwerker, Dienstleister, Besichtigung — bekommt
 * den Schluessel fuer einen Vorgang. Ohne Datum wird diese Ausgabe nie
 * ueberfaellig, taucht in keiner Erinnerung auf und faellt erst auf, wenn
 * jemand den Schluessel sucht.
 */
export const HOLDER_KINDS_EXPECTING_RETURN: ReadonlySet<string> = new Set(['external']);

export function expectsReturnDate(holderKind: string | null | undefined): boolean {
  return holderKind !== null && holderKind !== undefined
    ? HOLDER_KINDS_EXPECTING_RETURN.has(holderKind)
    : false;
}

export type CustodyStatus =
  /** Rueckgabedatum liegt in der Vergangenheit. */
  | 'overdue'
  /** Rueckgabe steht innerhalb der naechsten RETURN_DUE_SOON_HOURS an. */
  | 'due_soon'
  /** Rueckgabedatum liegt weiter in der Zukunft. */
  | 'open'
  /** Kein Datum, aber ein Empfaenger, bei dem das eine Luecke ist. */
  | 'unmonitored'
  /** Kein Datum, weil die Ausgabe ihrer Natur nach dauerhaft ist. */
  | 'standing';

/**
 * Die Felder, die fuer die Bestandsrechnung gebraucht werden. Absichtlich
 * strukturell getypt statt an die generierte Row-Definition gebunden: die
 * Listenseite laedt weniger Spalten als die Detailseite, und beide sollen
 * denselben Rechenweg benutzen.
 */
export interface HandoverLike {
  id: string;
  kind: string;
  copies_count: number;
  issue_handover_id: string | null;
  happened_at: string;
  expected_return_at?: string | null;
  holder_kind?: string | null;
}

export interface OpenIssue {
  issueId: string;
  /** Ausgegebene Exemplare dieses Vorgangs. */
  issuedCopies: number;
  /** Davon bereits zurueckgenommen (ueber beliebig viele Rueckgaben). */
  returnedCopies: number;
  /** Was tatsaechlich noch draussen ist. Immer > 0, sonst waere es hier nicht. */
  outstandingCopies: number;
  /** Zeitpunkt der Ausgabe. */
  since: string;
  expectedReturnAt: string | null;
  status: CustodyStatus;
  /** Volle Tage seit der Ausgabe. */
  daysOut: number;
  /** Volle Tage ueber dem Rueckgabetermin. 0, wenn nicht (oder erst heute) ueberfaellig. */
  overdueDays: number;
}

export interface KeyCustody {
  issuedCopies: number;
  returnedCopies: number;
  /** Ausgegeben minus zurueckgenommen, nie negativ. */
  outstandingCopies: number;
  /** Offene Ausgaben, aelteste zuerst. */
  openIssues: OpenIssue[];
}

export const EMPTY_CUSTODY: KeyCustody = {
  issuedCopies: 0,
  returnedCopies: 0,
  outstandingCopies: 0,
  openIssues: [],
};

const SEVERITY: Record<CustodyStatus, number> = {
  overdue: 4,
  unmonitored: 3,
  due_soon: 2,
  open: 1,
  standing: 0,
};

export const CUSTODY_TONE: Record<CustodyStatus, 'danger' | 'warning' | 'muted'> = {
  overdue: 'danger',
  unmonitored: 'warning',
  due_soon: 'warning',
  open: 'muted',
  standing: 'muted',
};

/** `null` statt NaN, damit ein unlesbarer Zeitstempel nicht durchrutscht. */
function parseInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function returnsByIssue(handovers: ReadonlyArray<HandoverLike>): Map<string, number> {
  const map = new Map<string, number>();
  for (const h of handovers) {
    if (h.kind !== 'return') continue;
    const issueId = h.issue_handover_id;
    // Die CHECK-Constraint key_handovers_shape verlangt bei 'return' eine
    // issue_handover_id — der FK steht aber auf ON DELETE SET NULL. Eine
    // Rueckgabe ohne Bezug waere also moeglich und liesse sich keiner
    // Ausgabe zuordnen; sie hier stillschweigend zu ignorieren ist die
    // vorsichtige Richtung (zaehlt zu VIEL als draussen, nicht zu wenig).
    if (!issueId) continue;
    map.set(issueId, (map.get(issueId) ?? 0) + h.copies_count);
  }
  return map;
}

function buildOpenIssue(
  issue: HandoverLike,
  returnedCopies: number,
  outstandingCopies: number,
  nowMs: number,
): OpenIssue {
  const sinceMs = parseInstant(issue.happened_at);
  const daysOut = sinceMs === null ? 0 : Math.max(0, Math.floor((nowMs - sinceMs) / DAY_MS));

  const dueMs = parseInstant(issue.expected_return_at);
  let status: CustodyStatus;
  let overdueDays = 0;

  if (dueMs === null) {
    status = expectsReturnDate(issue.holder_kind) ? 'unmonitored' : 'standing';
  } else if (dueMs < nowMs) {
    status = 'overdue';
    overdueDays = Math.floor((nowMs - dueMs) / DAY_MS);
  } else if (dueMs - nowMs <= RETURN_DUE_SOON_HOURS * HOUR_MS) {
    status = 'due_soon';
  } else {
    status = 'open';
  }

  return {
    issueId: issue.id,
    issuedCopies: issue.copies_count,
    returnedCopies,
    outstandingCopies,
    since: issue.happened_at,
    expectedReturnAt: issue.expected_return_at ?? null,
    status,
    daysOut,
    overdueDays,
  };
}

function buildCustody(
  issues: ReadonlyArray<HandoverLike>,
  returned: Map<string, number>,
  now: Date,
): KeyCustody {
  const nowMs = now.getTime();
  let issuedCopies = 0;
  let returnedCopies = 0;
  const openIssues: OpenIssue[] = [];

  for (const issue of issues) {
    const issued = issue.copies_count;
    // Mehr zurueckgenommen als ausgegeben: die Datenbank verbietet das
    // nicht, sie prueft copies_count nur einzeln auf > 0 und kennt keine
    // Regel ueber die Vorgangsgrenze hinweg. Der Ueberschuss wird gekappt,
    // damit aus einem Erfassungsfehler bei einem Schluessel keine negative
    // Zahl im Gesamtbestand eines anderen wird.
    const takenBack = Math.min(issued, returned.get(issue.id) ?? 0);
    issuedCopies += issued;
    returnedCopies += takenBack;

    const outstanding = issued - takenBack;
    if (outstanding <= 0) continue;
    openIssues.push(buildOpenIssue(issue, takenBack, outstanding, nowMs));
  }

  // Aelteste zuerst: was am laengsten draussen ist, gehoert nach oben.
  openIssues.sort((a, b) => {
    const diff = (parseInstant(a.since) ?? 0) - (parseInstant(b.since) ?? 0);
    return diff !== 0 ? diff : a.issueId.localeCompare(b.issueId);
  });

  return {
    issuedCopies,
    returnedCopies,
    outstandingCopies: issuedCopies - returnedCopies,
    openIssues,
  };
}

/** Bestand eines einzelnen Schluessels aus seiner vollstaendigen Historie. */
export function computeCustody(
  handovers: ReadonlyArray<HandoverLike>,
  now: Date,
): KeyCustody {
  const returned = returnsByIssue(handovers);
  return buildCustody(
    handovers.filter((h) => h.kind === 'issue'),
    returned,
    now,
  );
}

/**
 * Bestand vieler Schluessel auf einmal, fuer die Listenseite.
 *
 * Die Rueckgabe-Zuordnung wird ueber den GESAMTEN Eingabesatz gebildet und
 * nicht je Gruppe: eine Rueckgabe verweist ueber issue_handover_id auf ihre
 * Ausgabe, und dass ihr key_id derselbe ist, garantiert kein Constraint.
 * Ueber alle Zeilen zu mappen kostet nichts und kann nicht danebenliegen.
 */
export function custodyByKey<T extends HandoverLike & { key_id: string }>(
  handovers: ReadonlyArray<T>,
  now: Date,
): Map<string, KeyCustody> {
  const returned = returnsByIssue(handovers);
  const issuesByKey = new Map<string, T[]>();
  for (const h of handovers) {
    if (h.kind !== 'issue') continue;
    const list = issuesByKey.get(h.key_id);
    if (list) list.push(h);
    else issuesByKey.set(h.key_id, [h]);
  }

  const out = new Map<string, KeyCustody>();
  for (const [keyId, issues] of issuesByKey) {
    out.set(keyId, buildCustody(issues, returned, now));
  }
  return out;
}

/** Schlimmster Zustand ueber alle offenen Ausgaben eines Schluessels. */
export function worstCustodyStatus(custody: KeyCustody): CustodyStatus | null {
  let worst: CustodyStatus | null = null;
  for (const issue of custody.openIssues) {
    if (worst === null || SEVERITY[issue.status] > SEVERITY[worst]) worst = issue.status;
  }
  return worst;
}

function copies(n: number): string {
  return `${n} ${n === 1 ? 'Exemplar' : 'Exemplare'}`;
}

function days(n: number): string {
  return `${n} ${n === 1 ? 'Tag' : 'Tagen'}`;
}

/**
 * Wie lange und wie viel — der Teil, der unabhaengig vom Rueckgabetermin gilt.
 * Nennt die Teilrueckgabe ausdruecklich, weil "noch 2 von 3" die Aussage ist,
 * die vorher komplett fehlte.
 */
export function describeCustodyAge(issue: OpenIssue): string {
  const menge =
    issue.returnedCopies > 0
      ? `noch ${issue.outstandingCopies} von ${issue.issuedCopies} Exemplaren`
      : copies(issue.outstandingCopies);
  const dauer = issue.daysOut === 0 ? 'seit heute' : `seit ${days(issue.daysOut)}`;
  return `${menge} ${dauer} draußen`;
}

/**
 * Der Rueckgabe-Zustand als Satzteil. `null` fuer 'open' — ein Termin in der
 * Zukunft ist keine Meldung wert, und die Seite zeigt das Datum ohnehin.
 */
export function describeReturnStatus(issue: OpenIssue): string | null {
  switch (issue.status) {
    case 'overdue':
      return issue.overdueDays > 0
        ? `Rückgabe überfällig seit ${days(issue.overdueDays)}`
        : 'Rückgabe seit heute überfällig';
    case 'due_soon':
      return 'Rückgabe steht an';
    case 'unmonitored':
      return 'kein Rückgabedatum hinterlegt';
    case 'standing':
      return 'dauerhafte Ausgabe';
    case 'open':
      return null;
  }
}

export interface CustodyTally {
  /** Schluessel mit mindestens einem Exemplar ausserhalb. */
  keysOut: number;
  /** Exemplare ausserhalb, ueber alle Schluessel. */
  copiesOut: number;
  /** Offene Ausgaben mit ueberschrittenem Rueckgabetermin. */
  overdueIssues: number;
  /** Offene Ausgaben an Externe ohne jedes Rueckgabedatum. */
  unmonitoredIssues: number;
  /** Laengste offene Ausgabe in Tagen, mit dem Schluessel dazu. */
  longestDaysOut: number;
  longestLabel: string | null;
}

export function tallyCustody(
  entries: ReadonlyArray<{ label: string; custody: KeyCustody }>,
): CustodyTally {
  const tally: CustodyTally = {
    keysOut: 0,
    copiesOut: 0,
    overdueIssues: 0,
    unmonitoredIssues: 0,
    longestDaysOut: 0,
    longestLabel: null,
  };

  for (const { label, custody } of entries) {
    if (custody.outstandingCopies <= 0) continue;
    tally.keysOut += 1;
    tally.copiesOut += custody.outstandingCopies;
    for (const issue of custody.openIssues) {
      if (issue.status === 'overdue') tally.overdueIssues += 1;
      if (issue.status === 'unmonitored') tally.unmonitoredIssues += 1;
      if (issue.daysOut > tally.longestDaysOut) {
        tally.longestDaysOut = issue.daysOut;
        tally.longestLabel = label;
      }
    }
  }

  return tally;
}

/** Kurztext fuer den Seitenkopf. */
export function describeCustodyTally(tally: CustodyTally): string | null {
  if (tally.copiesOut === 0) return null;
  const parts = [`${copies(tally.copiesOut)} ausgegeben`];
  if (tally.overdueIssues > 0) {
    parts.push(
      `${tally.overdueIssues} ${tally.overdueIssues === 1 ? 'Rückgabe' : 'Rückgaben'} überfällig`,
    );
  }
  return parts.join(' · ');
}

export function describeOverdueReturns(tally: CustodyTally): string | null {
  if (tally.overdueIssues === 0) return null;
  return (
    `${tally.overdueIssues} ${tally.overdueIssues === 1 ? 'Ausgabe hat' : 'Ausgaben haben'} ` +
    `den vereinbarten Rückgabetermin überschritten. Solange ein Schlüssel draußen ist, ` +
    `hat jemand Zutritt, der ihn zurückgeben sollte.`
  );
}

/**
 * Fuer Ausgaben an Externe, bei denen gar kein Rueckgabedatum hinterlegt ist.
 * Die sind gefaehrlicher als eine ueberfaellige Rueckgabe, weil sie nie
 * ueberfaellig WERDEN: ohne Termin kein Zustand, kein Badge, keine
 * Erinnerung — der Schluessel faellt erst auf, wenn ihn jemand sucht.
 */
export function describeUnmonitoredCustody(tally: CustodyTally): string | null {
  if (tally.unmonitoredIssues === 0) return null;
  const n = tally.unmonitoredIssues;
  return (
    `${n} offene ${n === 1 ? 'Ausgabe an einen Externen' : 'Ausgaben an Externe'} ohne ` +
    `Rückgabedatum: ${n === 1 ? 'sie wird' : 'sie werden'} nie überfällig und ` +
    `${n === 1 ? 'taucht' : 'tauchen'} in keiner Erinnerung auf.`
  );
}
