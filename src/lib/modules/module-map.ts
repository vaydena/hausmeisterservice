/**
 * Sprint 117: Welche Route gehoert zu welchem abschaltbaren Modul.
 *
 * `registry.ts` steht seit dem ersten Tag die Zusage darueber:
 *
 *     "Disabled modules must not appear in navigation — routes return 404,
 *      not 403."
 *
 * Der erste Halbsatz war umgesetzt (`filterNavGroups`), der zweite nicht.
 * `isModuleEnabled()` hatte bis zu diesem Sprint null Aufrufer. Wer ein Modul
 * unter Einstellungen->Mandant abschaltete, verlor nur den Menuepunkt: die
 * URL blieb tippbar, Deep-Links aus E-Mails und Lesezeichen zeigten weiter
 * auf die Route, und die Seite lieferte klaglos die Daten aus. Fuer einen
 * Mandanten, der "Zeiterfassung" abschaltet, weil seine Mitarbeiter sie
 * nicht sehen sollen, ist das kein kosmetischer Unterschied.
 *
 * Warum eine eigene Tabelle und nicht `MODULES[].menuPath`? Weil menuPath
 * genau einen Einstieg pro Modul kennt, ein Modul aber mehrere Routen-Aeste
 * hat: die Zeiterfassung haengt auch an `/time-corrections`, die Checklisten
 * an `/checklist-runs`, und die QR-Codes haben ueberhaupt keinen Menuepunkt.
 * Aus menuPath abgeleitet blieben genau diese Routen offen — also die, die
 * niemand im Menue sieht und deshalb auch niemand nachprueft.
 *
 * Bewusst frei von Datenbank und `server-only`: reine Konfiguration, direkt
 * in tests/module-map.test.ts pruefbar. Ein Mandant mit abgeschaltetem Modul
 * laesst sich im Browser sonst nur von Hand herstellen.
 */
import { MODULES_BY_KEY, type ModuleKey } from '@/lib/modules/registry';
import { normalizeRoutePath, pathHasPrefix } from '@/lib/routing/path-prefix';

/**
 * Routen-Praefixe im Staff-Bereich pro Modul. Kern-Module stehen hier nicht —
 * sie sind nicht abschaltbar, ein Eintrag waere eine Sperre, die niemand mehr
 * loesen kann (`/settings/tenant` ist der Ort, an dem man Module wieder
 * einschaltet).
 *
 * Module ohne eigene Staff-Route fehlen bewusst:
 *   resident_portal / owner_portal — eigene Route-Group mit eigenem Gate
 *   work_reports / photos / shifts — noch nicht gebaut
 */
export const MODULE_PATHS: Partial<Record<ModuleKey, readonly string[]>> = {
  properties: ['/properties'],
  employees: ['/people/employees'],
  work_orders: ['/work-orders'],
  defect_reports: ['/defect-reports'],
  residents: ['/people/residents'],
  owners: ['/people/owners'],
  maintenance: ['/maintenance'],
  // Ein Checklisten-Durchlauf ist die Ausfuehrung einer Checkliste — ohne das
  // Modul gibt es die Vorlage nicht, die er abarbeitet.
  checklists: ['/checklists', '/checklist-runs'],
  documents: ['/documents'],
  // Korrekturantraege sind Zeiterfassung: sie aendern Zeiteintraege.
  time_tracking: ['/time-tracking', '/time-corrections'],
  scheduling: ['/schedule'],
  tours: ['/tours'],
  gps: ['/map'],
  keys: ['/keys'],
  meters: ['/meters'],
  materials: ['/materials'],
  vehicles: ['/vehicles'],
  messaging: ['/messages'],
  announcements: ['/announcements'],
  billing: ['/billing'],
  reporting: ['/reports'],
  automations: ['/settings/automations'],
  // Kein Menuepunkt, aber zwei Seiten: die Druckansicht und der Einzelcode.
  qr_codes: ['/qr'],
};

/**
 * Sprint 118: Dasselbe fuer die Route-Handler unter `src/app/api`.
 *
 * Das Gate aus Sprint 117 haengt im `(app)`-Layout und greift damit nur bei
 * Seiten. Die API-Routen liefen daran vorbei: `/api/qr/property/<id>` gab den
 * SVG auch dann heraus, wenn der Mandant QR-Codes abgeschaltet hatte, und
 * `/api/invoices/<id>/pdf` die Rechnung ohne Abrechnungsmodul. Wer die
 * Rechnungs-URL einmal im Browserverlauf oder in einer Mail hat, kommt also
 * weiter an das Dokument — die abgeschaltete Oberflaeche davor ist dann nur
 * noch Dekoration.
 *
 * Eine eigene Tabelle statt `/api` + MODULE_PATHS, weil sich die Praefixe
 * nicht decken: das Abrechnungsmodul liegt in der UI unter `/billing`, seine
 * Handler aber unter `/api/invoices` und `/api/offers`. Eine Ableitung haette
 * genau diese beiden verfehlt — und zwar lautlos.
 */
export const API_MODULE_PATHS: Partial<Record<ModuleKey, readonly string[]>> = {
  qr_codes: ['/api/qr'],
  billing: ['/api/invoices', '/api/offers'],
  documents: ['/api/documents'],
};

/** Laengster Praefix gewinnt; siehe `moduleForPath`. */
function longestPrefixMatch(
  table: Partial<Record<ModuleKey, readonly string[]>>,
  pathname: string,
): ModuleKey | null {
  const path = normalizeRoutePath(pathname);
  if (!path) return null;

  let match: ModuleKey | null = null;
  let matchedLength = -1;

  for (const [key, prefixes] of Object.entries(table) as [ModuleKey, readonly string[]][]) {
    for (const prefix of prefixes) {
      if (!pathHasPrefix(path, prefix)) continue;
      if (prefix.length > matchedLength) {
        match = key;
        matchedLength = prefix.length;
      }
    }
  }

  return match;
}

/**
 * Welches abschaltbare Modul deckt diesen Pfad ab — oder keines?
 *
 * Laengster Treffer gewinnt. Heute ueberlappt sich nichts, aber die Regel
 * muss stehen, bevor der erste Unterpfad dazukommt: ein spaeteres
 * `/settings/automations/logs` als eigenes Modul darf nicht davon abhaengen,
 * in welcher Reihenfolge die Eintraege zufaellig in der Tabelle stehen.
 */
export function moduleForPath(pathname: string): ModuleKey | null {
  return longestPrefixMatch(MODULE_PATHS, pathname);
}

/** Wie `moduleForPath`, aber fuer die Route-Handler unter `/api`. */
export function moduleForApiPath(pathname: string): ModuleKey | null {
  return longestPrefixMatch(API_MODULE_PATHS, pathname);
}

/** Alle API-Praefixe, die dieses Modul abdeckt. */
export function apiPathsForModule(moduleKey: ModuleKey): readonly string[] {
  return API_MODULE_PATHS[moduleKey] ?? [];
}

/** Alle Routen-Praefixe, die dieses Modul abdeckt. */
export function pathsForModule(moduleKey: ModuleKey): readonly string[] {
  return MODULE_PATHS[moduleKey] ?? [];
}

/**
 * Module, die eine Route bewachen, aber laut Registry Kern sind — das darf
 * nicht vorkommen und wird im Test geprueft. Hier als Funktion, damit der
 * Test die Regel nicht nachbaut, sondern dieselbe Antwort liest.
 */
export function coreModulesWithPaths(): ModuleKey[] {
  return [
    ...new Set([
      ...(Object.keys(MODULE_PATHS) as ModuleKey[]),
      ...(Object.keys(API_MODULE_PATHS) as ModuleKey[]),
    ]),
  ].filter((key) => MODULES_BY_KEY[key]?.core === true);
}
