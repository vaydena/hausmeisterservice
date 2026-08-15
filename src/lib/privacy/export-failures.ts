/**
 * Sprint 105: Eine DSGVO-Auskunft darf nicht stillschweigend unvollstaendig sein.
 *
 * Die beiden Export-Routen sammeln zwanzig bzw. neun Query-Results per
 * Promise.all ein und schreiben jedes einzeln ins JSON:
 *
 *     time_entries: timeEntries.data ?? [],
 *
 * Scheitert eine dieser Queries — kaputte RLS, Timeout, umbenannte Spalte —,
 * steht dort `[]`. Das ist derselbe verschluckte Fehler wie in Sprint 103/104,
 * aber die Folge ist hier eine andere: das Dokument behauptet in
 * `export_meta.legal_basis` ausdruecklich, es enthalte ALLE zum Konto
 * gespeicherten personenbezogenen Daten. Der Betroffene bekommt also eine
 * Luecke als Vollstaendigkeitserklaerung ausgehaendigt, haelt seine Auskunft
 * fuer erledigt und hoert auf zu fragen. Genau das soll Art. 15 verhindern.
 *
 * Deshalb gilt fuer den Export: lieber gar keine Auskunft als eine falsche.
 * Ein Export ist beliebig wiederholbar, eine geglaubte Vollstaendigkeit nicht.
 *
 * Warum hier gesammelt statt beim ersten Fehler geworfen wird: zu dem
 * Zeitpunkt sind ohnehin alle Queries gelaufen (Promise.all), der Abbruch
 * spart also nichts. Faellt eine ganze Tabellenfamilie aus — der 42P17-Fall,
 * bei dem eine rekursive Policy jede Query gegen mehrere Tabellen zerlegt —,
 * ist "drei von einundzwanzig Bereichen betroffen, naemlich diese" ein
 * brauchbarer Befund, waehrend der erste Treffer allein zu einer Runde
 * Fix-und-nochmal fuehrt.
 */

/**
 * Strukturell getypt, analog zu @/lib/supabase/unwrap: derselbe Helper soll
 * Ergebnisse von .select(), .maybeSingle() und .order() annehmen koennen,
 * ohne an einem konkreten Export von supabase-js zu haengen.
 */
interface QueryErrorLike {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export interface ExportFailure {
  /** Klartext-Bereich, wie er dem Betroffenen genannt wird ("Arbeitszeiten"). */
  category: string;
  code: string | undefined;
  message: string;
}

/** PostgREST-Code fuer ".single() hat keine Zeile gefunden" — kein Ausfall. */
const NO_ROWS_CODE = 'PGRST116';

/**
 * Nimmt die Query-Results unter ihren Klartext-Bereichsnamen entgegen und
 * liefert die gescheiterten zurueck. Leeres Array heisst: der Export ist
 * vollstaendig und darf ausgeliefert werden.
 *
 * Ein legitim leeres Ergebnis taucht hier nie auf: PostgREST meldet Leere
 * als `data: []` mit `error: null`. Ein gesetztes `error` bedeutet immer,
 * dass die Query nicht ausgefuehrt werden konnte.
 */
export function collectExportFailures(
  results: Record<string, { error: QueryErrorLike | null }>,
): ExportFailure[] {
  const failures: ExportFailure[] = [];
  for (const [category, result] of Object.entries(results)) {
    const error = result.error;
    if (!error) continue;
    // .maybeSingle() liefert bei "nichts gefunden" error: null, .single()
    // dagegen PGRST116. Beides ist ein Zustand, kein Ausfall — sonst wuerde
    // ein Nutzer ohne Profilzeile nie einen Export bekommen.
    if (error.code === NO_ROWS_CODE) continue;
    failures.push({ category, code: error.code, message: error.message });
  }
  return failures;
}

/**
 * Der Text, den der Betroffene zu sehen bekommt.
 *
 * Die Bereichsnamen stehen bewusst drin — es sind seine eigenen Daten, und
 * ohne sie ist die Meldung nicht nachvollziehbar. Die PostgREST-Meldung
 * dagegen bleibt draussen: sie verraet Tabellen- und Policy-Namen und hilft
 * dem Leser nicht weiter. Die gehoert nach Sentry.
 */
export function describeExportFailures(failures: ExportFailure[]): string {
  const areas = failures.map((f) => `- ${f.category}`).join('\n');
  return [
    'Ihre Datenauskunft konnte nicht vollstaendig erstellt werden.',
    '',
    'Folgende Bereiche liessen sich nicht auslesen:',
    areas,
    '',
    'Wir liefern die Auskunft deshalb bewusst nicht aus: ein Export, in dem',
    'diese Bereiche stillschweigend fehlen, saehe wie eine vollstaendige',
    'Auskunft aus und waere keine. Die Stoerung wurde automatisch gemeldet.',
    'Bitte versuchen Sie es spaeter erneut.',
  ].join('\n');
}

/**
 * Die Fehlermeldung fuer Sentry. Enthaelt die technischen Details, die dem
 * Betroffenen nichts sagen, und stellt die Zahl voran, weil "3 von 21" die
 * Information ist, an der man sofort erkennt, ob eine einzelne Tabelle oder
 * die halbe Datenbank betroffen ist.
 */
export function summarizeExportFailures(
  failures: ExportFailure[],
  totalCategories: number,
): string {
  const detail = failures
    .map((f) => `${f.category}${f.code ? ` [${f.code}]` : ''}: ${f.message}`)
    .join('; ');
  return `DSGVO-Export abgebrochen — ${failures.length} von ${totalCategories} Bereichen nicht lesbar: ${detail}`;
}
