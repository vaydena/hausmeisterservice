/**
 * Sprint 117: Pfad-Praefix-Abgleich fuer die Routen-Gates.
 *
 * Es gibt zwei davon, und sie muessen sich ueber denselben Pfad einig sein:
 *
 *   feature-map.ts  — sperrt, was der gebuchte Tarif nicht enthaelt
 *   module-map.ts   — sperrt, was der Mandant selbst abgeschaltet hat
 *
 * Bis Sprint 116 trug feature-map seine eigene `normalizePath`. Eine zweite
 * Kopie daneben waere genau die Art Duplikat, die ein halbes Jahr spaeter
 * auseinanderlaeuft: das eine Gate schneidet den Slash am Ende ab, das
 * andere nicht — und `/vehicles/` faellt dann durch das eine, aber nicht
 * durch das andere. Der Unterschied ist nicht sichtbar, bis jemand die URL
 * mit Slash tippt.
 *
 * Bewusst frei von Datenbank und `server-only`: reine Zeichenketten-Logik,
 * direkt in tests/path-prefix.test.ts pruefbar.
 */

/** Query, Fragment und ein abschliessender Slash weg — der Rest ist der Pfad. */
export function normalizeRoutePath(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/)[0] ?? '';
  const trimmed = withoutQuery.trim();
  if (trimmed.length > 1 && trimmed.endsWith('/')) return trimmed.slice(0, -1);
  return trimmed;
}

/**
 * Deckt `prefix` diesen Pfad ab?
 *
 * Vergleich mit Segmentgrenze: `/vehicles` deckt `/vehicles/neu` ab, aber
 * nicht ein spaeteres `/vehicles-export`. Ein `startsWith` ohne diese Grenze
 * wuerde irgendwann still eine fremde Route mitsperren.
 */
export function pathHasPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}
