/**
 * Sprint 98: Freitext-Suchbegriffe fuer PostgREST-Filter entschaerfen.
 *
 * Die Logik lag bis hierher dreimal woertlich identisch in den Portal-Listen
 * (Meldungen, Nachrichten, Ankuendigungen) und fehlte auf der Staff-Seite
 * komplett. Beim vierten Aufruf ist der Zeitpunkt zum Extrahieren erreicht —
 * und weil es hier um Query-Struktur geht und nicht um Kosmetik, ist die
 * Duplikation nicht nur laestig, sondern der Weg, auf dem eine neue Liste
 * die Absicherung schlicht vergisst.
 *
 * Zwei Ebenen, weil die beiden Aufrufwege unterschiedlich exponiert sind:
 *
 * 1. sanitizeLikeTerm — fuer den Builder query.ilike('spalte', '%X%').
 *    PostgREST kodiert den Wert selbst, die Query-Struktur ist also nicht
 *    angreifbar. Zu behandeln bleiben die LIKE-Wildcards % und _, die sonst
 *    still als Muster wirken statt als getippte Zeichen.
 *
 * 2. sanitizeOrFilterTerm — fuer den roh zusammengebauten `query.or('...')`.
 *    Dort ist der Begriff Teil des Filterausdrucks: ein Komma trennt
 *    OR-Zweige, Klammern gruppieren. Ohne Filterung kann ein Suchbegriff
 *    einen zusaetzlichen OR-Zweig anhaengen und damit die beabsichtigte
 *    Einschraenkung aushebeln (RLS greift weiter, die Liste zeigt aber
 *    mehr als gefiltert wurde) oder den Ausdruck in einen 400 kippen.
 *
 * Ersetzt wird durch ein Leerzeichen, nicht escaped: ein `\%` muesste sich
 * unveraendert durch PostgREST bis in das ILIKE-Muster durchreichen, und
 * darauf wollen wir uns nicht verlassen. Der Preis ist, dass ein wirklich
 * gesuchtes Prozentzeichen nicht findbar ist — in Mangel-Titeln, Betreffs
 * und Kennzeichen ein vertretbarer Tausch. Das Leerzeichen statt Leerstring
 * ist bewusst: "A%B" soll zu "A B" werden und nicht zu einem Wort "AB"
 * verschmelzen, das es so nirgends gibt.
 *
 * Beide Funktionen trimmen am Ende, damit ein Begriff, der nur aus
 * Sonderzeichen bestand, als Leerstring herauskommt. Aufrufer pruefen die
 * Laenge des *sanitisierten* Terms, nicht die der Rohreingabe — sonst haengt
 * an `q=%%` ein `ilike.%%`, das jede Zeile matcht.
 */

const LIKE_WILDCARDS = /[%_]/g;
const OR_FILTER_RESERVED = /[%_,()]/g;

/** Fuer Werte, die per Builder-Methode (.ilike/.like) uebergeben werden. */
export function sanitizeLikeTerm(raw: string | null | undefined): string {
  return (raw ?? '').replace(LIKE_WILDCARDS, ' ').trim();
}

/** Fuer Werte, die in einen roh gebauten .or()-Filterausdruck wandern. */
export function sanitizeOrFilterTerm(raw: string | null | undefined): string {
  return (raw ?? '').replace(OR_FILTER_RESERVED, ' ').trim();
}
