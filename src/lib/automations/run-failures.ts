/**
 * Sprint 106: Meldetexte fuer gescheiterte Automations-Laeufe.
 *
 * Die Automations-Engine hat als einzige Schicht in diesem Bogen (103–106)
 * gar keinen Nutzer, dem man etwas zeigen koennte: sie laeuft als Cron. Es
 * gibt keine Server-Component, die error.tsx rendern koennte, und keinen
 * Aufrufer, der eine 500 mit lesbarem Text liest.
 *
 * Die Melde-Kanaele sind trotzdem laengst gebaut — sie waren nur nie belegt:
 *
 *   - `automation_rules.last_error` -> Badge "Fehler" in der Regel-Liste und
 *     ein rotes Panel auf der Regel-Detailseite
 *   - `automation_runs.error`       -> Spalte "Fehlermeldung" in der Tabelle
 *     "Letzte Laeufe"
 *
 * Beide existieren seit Sprint 174. Beide zeigen seither ausnahmslos "—",
 * weil jeder Query-Fehler in der Engine per `?? []` verschluckt wurde, bevor
 * er sie erreichen konnte. Diese Datei liefert die Texte, die dort ab jetzt
 * stehen.
 *
 * Anders als bei der DSGVO-Auskunft (Sprint 105) gehoert die technische
 * Meldung hier ausdruecklich HINEIN: Leser ist nicht der Betroffene, sondern
 * ein Mitarbeiter mit `automations.manage`, der wissen muss, ob seine Regel
 * kaputt ist oder die Datenbank. Deshalb wird die PostgREST-Meldung angehaengt
 * statt weggelassen.
 */

/**
 * Phasen, in denen ein Lauf abbrechen kann, OHNE dass bereits etwas nach
 * aussen gegangen ist. Genau das macht den Abbruch hier vertretbar: ein
 * ausgelassener Cron-Zyklus wird vom naechsten nachgeholt, ein zu Unrecht
 * verschickter Schwung E-Mails nicht.
 */
export type AbortPhase = 'evaluate' | 'dispatch-filter' | 'recipients';

const PHASE_LABEL: Record<AbortPhase, string> = {
  evaluate: 'Trigger-Auswertung',
  'dispatch-filter': 'Doppel-Versand-Prüfung',
  recipients: 'Empfänger-/Absender-Ermittlung',
};

/**
 * Eine PostgREST-Meldung mit `details` und `hint` kann lang werden, und
 * `last_error` steht als einzeiliges Panel in der Oberflaeche. Der Anfang
 * traegt die Information (Code + Ursache), der Rest steht in Sentry.
 */
const MAX_TECHNICAL = 400;

export function technicalMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.length > MAX_TECHNICAL ? `${raw.slice(0, MAX_TECHNICAL)}…` : raw;
}

/**
 * Fuer Abbrueche vor der Aktions-Phase. Die zweite Haelfte des Satzes ist
 * das Entscheidende: ohne "es wurde nichts versendet" muss der Leser raten,
 * ob er jetzt manuell nacharbeiten oder auf Doppel-Versand achten muss.
 */
export function describeAbortedRun(phase: AbortPhase, err: unknown): string {
  return (
    `${PHASE_LABEL[phase]} fehlgeschlagen — Lauf abgebrochen, es wurde nichts ` +
    `versendet. Der nächste Lauf versucht es erneut. ${technicalMessage(err)}`
  );
}

/**
 * Der teuerste Fall der Engine, und der einzige, der sich nicht mehr
 * verhindern laesst: die Aktionen sind gelaufen, aber der Eintrag in
 * `automation_dispatches` ist nicht geschrieben worden.
 *
 * Dieser Eintrag IST die Doppel-Versand-Sperre — `filterAlreadyDispatched`
 * liest genau ihn. Fehlt er, gelten dieselben Vorgaenge beim naechsten Lauf
 * wieder als frisch und dieselben E-Mails gehen erneut raus. Deshalb steht
 * die Warnung hier im Text und nicht nur in Sentry: der Betreiber kann das
 * abstellen (Regel deaktivieren, Dispatches nachtragen), aber nur, wenn er
 * es erfaehrt, bevor der naechste Zyklus laeuft.
 */
export function describeDispatchLogFailure(dispatched: number, err: unknown): string {
  return (
    `${dispatched} Aktion(en) wurden ausgeführt, aber das Dispatch-Protokoll ` +
    `konnte nicht geschrieben werden. Diese Vorgänge gelten weiterhin als ` +
    `unerledigt — beim nächsten Lauf droht ein Doppel-Versand. ` +
    `${technicalMessage(err)}`
  );
}
