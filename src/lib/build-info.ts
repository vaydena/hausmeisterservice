import 'server-only';

/**
 * Sprint 99: Build-Marker fuer /api/health.
 *
 * Jeder Sprint endet mit einem HTTP-Verify gegen die Live-Domain. Bisher
 * belegte eine gruene Antwort dort nur, dass ueberhaupt eine Instanz
 * bedient — nicht, dass sie den gerade gepushten Stand ausliefert. Bei
 * Hostingers Git-Auto-Deploy vergehen zwischen Push und fertigem Build
 * mehrere Minuten, in denen der Vorgaenger weiter antwortet. Der Verify
 * konnte also den alten Build meinen, und genau das war ihm nicht
 * anzusehen.
 *
 * Die Werte entstehen in next.config.mjs zur Build-Zeit und werden ueber
 * dessen `env`-Block in das Bundle einkompiliert. Sie beschreiben damit den
 * Build und nicht die laufende Maschine — das ist der ganze Punkt. Eine
 * erst zur Laufzeit gelesene Variable haette auf dem alten Build denselben
 * Wert geliefert und nichts bewiesen.
 *
 * Verlaesslich ist dabei APP_BUILD_TIME: ein Zeitstempel aendert sich bei
 * jedem Build, unabhaengig davon, ob auf dem Build-Host ueberhaupt ein git
 * liegt. APP_BUILD_SHA ist die Zugabe, die den Build zusaetzlich an einen
 * Commit bindet — faellt sie auf 'unknown' zurueck, bleibt der Zeitstempel
 * als Beweis trotzdem gueltig.
 *
 * Fallstrick fuer spaetere Aenderungen: Next.js ersetzt beim Build nur die
 * woertliche Property-Schreibweise `process.env.APP_BUILD_SHA`. Ein
 * Destructuring (`const { APP_BUILD_SHA } = process.env`) wird NICHT
 * ersetzt und ergibt still `undefined` — der Marker stuende dann dauerhaft
 * auf 'unknown', ohne dass irgendwo etwas fehlschlaegt.
 *
 * `import 'server-only'` steht hier, weil env-var-client-bundle-coverage
 * jeden Konsumenten einer Nicht-NEXT_PUBLIC_-Variable bundler-seitig an den
 * Server bindet. Der Marker ist kein Geheimnis, im Browser aber auch
 * nirgends gebraucht.
 */

/** Ersatzwert, wenn zur Build-Zeit nichts zu ermitteln war. */
export const UNKNOWN_BUILD_VALUE = 'unknown';

/**
 * Kurz-SHA-Laenge. 12 Zeichen sind bei dieser Repo-Groesse eindeutig und
 * lassen sich noch von Hand gegen `git log --oneline` halten. Die Kuerzung
 * begrenzt gleichzeitig, wie viel Text ein gesetzter Env-Wert ueberhaupt in
 * die unauthentifizierte Antwort schreiben kann.
 */
const SHA_LENGTH = 12;

export type BuildInfo = {
  /** Kurz-SHA des Commits, aus dem gebaut wurde — oder 'unknown'. */
  sha: string;
  /** ISO-8601-Zeitpunkt des Builds — oder 'unknown'. */
  time: string;
};

/**
 * Rohwerte in die Form bringen, die /api/health ausliefert.
 *
 * Auf dem SHA bewusst keine Format-Pruefung: die Variable setzt der
 * Betreiber, nicht ein Aufrufer, und ein Deploy, das statt eines Hashes ein
 * Tag wie "v1.4.0" hineinschreibt, ist eine legitime Nutzung, die eine
 * Hex-Pruefung nur kaputtmachen wuerde. Gegen Muell schuetzen die Kuerzung
 * und das JSON-Escaping der Antwort.
 *
 * Der Zeitstempel wird dagegen geparst und neu formatiert — er hat genau
 * eine richtige Schreibweise, und ein unlesbarer Wert ist als 'unknown'
 * ehrlicher als roh durchgereicht.
 */
export function normalizeBuildInfo(raw: {
  sha?: string | null;
  time?: string | null;
}): BuildInfo {
  return {
    sha: normalizeSha(raw.sha),
    time: normalizeTime(raw.time),
  };
}

function normalizeSha(raw: string | null | undefined): string {
  // trim() faengt den Zeilenumbruch ab, den `git rev-parse` anhaengt.
  const trimmed = (raw ?? '').trim();
  if (trimmed.length === 0) return UNKNOWN_BUILD_VALUE;
  return trimmed.slice(0, SHA_LENGTH);
}

function normalizeTime(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (trimmed.length === 0) return UNKNOWN_BUILD_VALUE;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return UNKNOWN_BUILD_VALUE;
  return parsed.toISOString();
}

/** Build-Marker des Bundles, das diesen Prozess bedient. */
export function getBuildInfo(): BuildInfo {
  return normalizeBuildInfo({
    sha: process.env.APP_BUILD_SHA,
    time: process.env.APP_BUILD_TIME,
  });
}
