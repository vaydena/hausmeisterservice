// Erkennung + Selbstheilung fuer "veraltete Auslieferung"-Fehler.
//
// Nach einem Deploy referenziert ein noch offener Tab (oder aus dem Cache
// wiederhergestelltes HTML) JS-/CSS-Chunks bzw. Server-Action-IDs des ALTEN
// Builds. Die gibt es im neuen Build nicht mehr → der Chunk-Fetch 404t und
// React faellt in die Fehler-Boundary. Das ist KEIN Bug auf der Seite, sondern
// ein Cache-Versatz: ein einmaliges hartes Neuladen holt den frischen Build,
// danach funktioniert die Seite wieder. Diesen Fall wollen wir dem Nutzer nicht
// als Fehlermeldung zeigen, sondern still selbst reparieren.
//
// Die API ist bewusst zweigeteilt, damit die Fehler-Boundary lint-sauber
// bleibt (kein setState im Effekt):
//   • isStaleDeployError + canSelfHealNow — reine/lesende Checks, im
//     useState-Initializer aufrufbar (Entscheidung EINMAL beim Mount).
//   • performStaleDeployReload — der eigentliche Seiten-Effekt (Zeitstempel
//     schreiben + hart neu laden), gehoert in einen useEffect.

// Kleingeschriebene Teilstrings, an denen wir so einen Fehler erkennen. Message
// wird vor dem Vergleich ge-lowercased. Bewusst eng gehalten, damit echte Bugs
// nicht faelschlich ein Reload ausloesen. "loading css chunk" enthaelt NICHT
// "loading chunk" (das "css " dazwischen), daher stehen beide drin.
const STALE_DEPLOY_MESSAGE_HINTS = [
  'loading chunk',
  'loading css chunk',
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'dynamically imported module',
  'failed to find server action', // Next.js: Action-ID stammt aus altem Build
] as const;

export function isStaleDeployError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ChunkLoadError') return true;
  const message = (error.message ?? '').toLowerCase();
  return STALE_DEPLOY_MESSAGE_HINTS.some((hint) => message.includes(hint));
}

// Ein Auto-Reload pro kurzem Zeitfenster. Der Zeitstempel ueberlebt in
// sessionStorage das Neuladen; kommt derselbe Fehler innerhalb von
// RELOAD_GUARD_MS zurueck, laden wir NICHT erneut (sonst Endlosschleife).
const RELOAD_GUARD_KEY = 'app:staleDeployReloadAt';
const RELOAD_GUARD_MS = 15_000;

// Reiner Lesezugriff: Darf jetzt ein Auto-Reload erfolgen? Faellt window/
// sessionStorage aus (SSR, Privatmodus) oder liegt der letzte Auto-Reload
// weniger als RELOAD_GUARD_MS zurueck, geben wir false zurueck — dann zeigt die
// Boundary die normale Meldung, statt in eine Reload-Schleife zu laufen.
export function canSelfHealNow(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY) ?? '0');
    if (Number.isFinite(last) && last > 0 && Date.now() - last < RELOAD_GUARD_MS) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Seiten-Effekt: Schutz-Zeitstempel setzen und hart neu laden. Nur aus einem
// useEffect aufrufen, nachdem canSelfHealNow() true war.
export function performStaleDeployReload(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // sessionStorage nicht schreibbar — ein einzelner Reload ist trotzdem
    // harmlos; ohne Zeitstempel greift beim naechsten Mal eben der Guard nicht.
  }
  window.location.reload();
}
