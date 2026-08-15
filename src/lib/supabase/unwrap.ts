/**
 * Sprint 103: Fehlgeschlagene Supabase-Queries sichtbar machen.
 *
 * Anlass ist der 42P17-Bug im Messaging (Migration
 * 20260815160000_messaging_rls_fix_infinite_recursion.sql). Die RLS-Policy
 * lief in eine Endlosrekursion, jede Query gegen message_threads brach ab —
 * und trotzdem hat das monatelang niemand gemerkt. Der Grund steckt nicht in
 * der Policy, sondern im Aufrufmuster:
 *
 *     const { data: threads } = await supabase.from('message_threads')...
 *     const visible = (threads ?? []).filter(...)
 *
 * supabase-js wirft nicht. Es liefert `{ data: null, error: <PostgrestError> }`.
 * Wer nur `data` destrukturiert, verliert den Fehler ersatzlos, und `?? []`
 * macht daraus eine leere Liste. Die Seite rendert daraufhin ihren voellig
 * normalen Leerzustand — "Sie haben noch keine Nachrichten". Ein Totalausfall
 * sieht damit pixelgleich aus wie der Normalfall "es gibt nichts".
 *
 * Der entscheidende Punkt, der das Werfen hier ueberhaupt vertretbar macht:
 * PostgREST meldet Leere NIE ueber `error`. Keine Treffer heisst `data: []`
 * mit `error: null`. Ein gesetztes `error` bedeutet immer, dass die Query
 * nicht ausgefuehrt werden konnte — kaputte RLS, fehlende Spalte, Timeout,
 * DB weg. Das sind Stoerungen, keine Zustaende. Deshalb kann diese
 * Fehlerbehandlung nicht bei einer legitim leeren Liste zuschlagen.
 *
 * Was beim Werfen passiert, ist bereits gebaut: In einer Server-Komponente
 * faengt Next.js die Exception und rendert src/app/error.tsx (Sprint 16),
 * Sentry meldet sie (Sprint 2). Aus dem stillen Datenverlust wird also eine
 * sichtbare Fehlerseite plus ein Alert — genau die zwei Dinge, die beim
 * Messaging-Bug gefehlt haben.
 *
 * `context` wandert in die Meldung und ist das, was in Sentry als erstes
 * gelesen wird. Deshalb dort beschreiben, WAS geladen werden sollte
 * ("Portal: Nachrichten-Threads"), nicht wo der Aufruf steht — den Ort
 * liefert der Stacktrace ohnehin.
 */

/**
 * Strukturell getypt statt `PostgrestError` zu importieren: dieselbe Form
 * kommt auch von den Storage- und RPC-Aufrufen, und so haengt der Helper
 * nicht an einem konkreten Export der Client-Bibliothek.
 */
interface QueryErrorLike {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

interface QueryResultLike<T> {
  data: T | null;
  error: QueryErrorLike | null;
}

/** PostgREST-Code fuer ".single() hat keine Zeile gefunden". */
const NO_ROWS_CODE = 'PGRST116';

export class SupabaseQueryError extends Error {
  readonly code: string | undefined;
  readonly details: string | null | undefined;
  readonly hint: string | null | undefined;

  constructor(context: string, error: QueryErrorLike) {
    // Code mit in die Message: Sentry gruppiert nach Message, und ein
    // 42P17 (Rekursion) ist ein voellig anderes Problem als ein 42501
    // (Policy verbietet den Zugriff) — die sollen nicht in einem Issue
    // zusammenlaufen.
    super(
      `${context} fehlgeschlagen${error.code ? ` [${error.code}]` : ''}: ${error.message}`,
    );
    this.name = 'SupabaseQueryError';
    this.code = error.code;
    this.details = error.details;
    this.hint = error.hint;
  }
}

/**
 * Fuer Listen-Queries. Wirft bei `error`, liefert sonst die Zeilen —
 * eine leere Liste bleibt eine leere Liste.
 */
export function unwrapRows<T>(result: QueryResultLike<T[]>, context: string): T[] {
  if (result.error) throw new SupabaseQueryError(context, result.error);
  return result.data ?? [];
}

/**
 * Fuer Listen-Queries mit `{ count: 'exact' }`. Der Zaehler hat dieselbe
 * Falle wie die Liste: `count ?? 0` macht aus einem Fehler eine glaubhafte
 * Null, die dann als Kennzahl auf einer Karte steht.
 */
export function unwrapRowsWithCount<T>(
  result: QueryResultLike<T[]> & { count: number | null },
  context: string,
): { rows: T[]; count: number } {
  if (result.error) throw new SupabaseQueryError(context, result.error);
  return { rows: result.data ?? [], count: result.count ?? 0 };
}

/**
 * Fuer `.maybeSingle()` / `.single()`, wo "nicht gefunden" ein erwarteter
 * Fall ist (der Aufrufer macht daraus in der Regel ein notFound()).
 *
 * `.maybeSingle()` liefert dafuer `data: null, error: null`, `.single()`
 * dagegen PGRST116 — beide Wege muessen hier als "kein Treffer"
 * durchgehen und duerfen nicht als Stoerung geworfen werden.
 */
// Inferenz ueber das GESAMTE Result statt ueber `data`: supabase-js typisiert
// .maybeSingle() als Union `{data: T, error: null} | {data: null, error: E}`.
// Gegen ein `data: T | null` inferiert TypeScript daraus `never`, weil es die
// Kandidaten T und null schneidet. Ueber R['data'] entsteht dagegen sauber
// `T | null`, und NonNullable holt das T zurueck.
export function unwrapMaybeRow<R extends { data: unknown; error: QueryErrorLike | null }>(
  result: R,
  context: string,
): NonNullable<R['data']> | null {
  if (result.error && result.error.code !== NO_ROWS_CODE) {
    throw new SupabaseQueryError(context, result.error);
  }
  return (result.data ?? null) as NonNullable<R['data']> | null;
}
