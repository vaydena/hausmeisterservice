/**
 * Module Registry — single source of truth for modules per MASTER_PROMPT §2.
 *
 * A module is admin-toggleable (see `tenant_modules` table). Modules marked
 * `core: true` are always enabled and cannot be turned off. Disabled modules
 * must not appear in navigation — routes return 404, not 403.
 */

export type ModuleKey =
  // Core (always on)
  | 'core.auth'
  | 'core.tenants'
  | 'core.users_roles'
  | 'core.dashboard'
  | 'core.notifications'
  | 'core.audit_log'
  // Toggleable
  | 'properties'
  | 'employees'
  | 'work_orders'
  | 'defect_reports'
  | 'residents'
  | 'owners'
  | 'resident_portal'
  | 'owner_portal'
  | 'maintenance'
  | 'checklists'
  | 'work_reports'
  | 'documents'
  | 'photos'
  | 'time_tracking'
  | 'scheduling'
  | 'shifts'
  | 'tours'
  | 'gps'
  | 'keys'
  | 'meters'
  | 'materials'
  | 'vehicles'
  | 'messaging'
  | 'announcements'
  | 'billing'
  | 'reporting'
  | 'automations'
  | 'qr_codes';

export type ModuleDomain =
  | 'core'
  | 'objects'
  | 'people'
  | 'tasks'
  | 'field'
  | 'resources'
  | 'communication'
  | 'finance'
  | 'platform';

export interface ModuleDefinition {
  key: ModuleKey;
  labelDe: string;
  domain: ModuleDomain;
  core: boolean;
  menuPath?: string;
  description: string;
  /**
   * Das Modul ist noch nicht gebaut — es gibt nichts, wohin es fuehren
   * koennte.
   *
   * SPRINT 133 — DER MENUPATH IST OPTIONAL. Anfangs hiess das hier "die
   * Seite zu `menuPath` fehlt", weil `gps` der einzige Fall war und einen
   * menuPath hatte. Damit ging die schlimmere Sorte durch die Maschen:
   * `shifts`, `photos`, `work_reports` und `owner_portal` hatten nie einen
   * menuPath, nie eine Route, nie eine Seite — und standen trotzdem als
   * Schalter unter Einstellungen -> Mandant, eingeschaltet bei jedem neuen
   * Mandanten. Wer "Schichten" umlegte, bekam keine Fehlerseite, sondern
   * gar nichts: kein neuer Menuepunkt, keine Meldung, keine Wirkung. Ein
   * 404 ist ein schlechtes Ergebnis, aber es ist wenigstens eine Antwort.
   *
   * Das Wissen war da — als Kommentar in module-map.ts stand woertlich
   * "work_reports / photos / shifts — noch nicht gebaut". Ein Kommentar
   * schaltet nichts ab.
   *
   * SPRINT 131 — WARUM DAS HIER STEHT UND NICHT IN EINER TESTDATEI. Bis
   * hierher lebte diese Information in `KNOWN_MISSING_PAGES` in
   * tests/nav-module-coverage.test.ts. Ein Test kann aber nur verhindern,
   * was er prueft, und geprueft wurde genau eine der drei Stellen, an denen
   * ein Modul eingeschaltet werden kann: die Signup-Vorauswahl.
   *
   * Der erste echte Testkunde hat gezeigt, was das kostet. Sein Mandant
   * entstand zwei Stunden vor dem Sprint-123-Riegel und hat `gps` an —
   * "Karte" steht in seiner Seitenleiste und fuehrt ins 404, fuer den
   * Inhaber ebenso wie fuer jeden Hausmeister, Gaertner und Fahrer (8 von
   * 15 Rollen haben `gps.view`). Das Tarif-Gate haelt es nicht auf: im
   * Trial gibt `getEnabledFeatures` alles frei. Und die Modul-Schalter
   * unter Einstellungen -> Mandant boten das Modul jedem Kunden weiterhin
   * zum Selbst-Einschalten an.
   *
   * Deshalb ist es jetzt eine Eigenschaft des Moduls, die alle vier
   * Stellen lesen: Navigation, Signup-Vorauswahl, Schalter-Oberflaeche,
   * Schalter-Aktion. Der Test leitet seine Liste von hier ab, statt eine
   * eigene zu fuehren — zwei Listen laufen auseinander, eine nicht.
   */
  unbuilt?: true;
}

export const MODULES: readonly ModuleDefinition[] = [
  { key: 'core.auth', labelDe: 'Authentifizierung', domain: 'core', core: true, description: 'Login, Sessions, Passwort-Reset.' },
  { key: 'core.tenants', labelDe: 'Mandant', domain: 'core', core: true, menuPath: '/settings/tenant', description: 'Unternehmensdaten, Branding, Nummernkreise.' },
  { key: 'core.users_roles', labelDe: 'Benutzer & Rollen', domain: 'core', core: true, menuPath: '/settings/users', description: 'Benutzerverwaltung, freikonfigurierbare Rollen und Rechte.' },
  { key: 'core.dashboard', labelDe: 'Dashboard', domain: 'core', core: true, menuPath: '/dashboard', description: 'Rollenspezifische Startseite.' },
  { key: 'core.notifications', labelDe: 'Benachrichtigungen', domain: 'core', core: true, description: 'Notification-Engine (In-App, Push, E-Mail).' },
  { key: 'core.audit_log', labelDe: 'Audit-Log', domain: 'core', core: true, menuPath: '/settings/audit', description: 'Protokollierung kritischer Änderungen.' },
  { key: 'properties', labelDe: 'Objekte', domain: 'objects', core: false, menuPath: '/properties', description: 'Liegenschaften, Gebäude, Einheiten, Anlagen.' },
  { key: 'employees', labelDe: 'Mitarbeiter', domain: 'people', core: false, menuPath: '/people/employees', description: 'Mitarbeiterprofile, Skills, Fahrzeuge.' },
  { key: 'work_orders', labelDe: 'Aufträge', domain: 'tasks', core: false, menuPath: '/work-orders', description: 'Auftragsmanagement inkl. Notfallaufträgen.' },

  { key: 'defect_reports', labelDe: 'Mängelmeldungen', domain: 'tasks', core: false, menuPath: '/defect-reports', description: 'Meldeworkflow (Bewohner/Eigentümer → Auftrag).' },
  { key: 'residents', labelDe: 'Bewohner', domain: 'people', core: false, menuPath: '/people/residents', description: 'Bewohnerverwaltung.' },
  { key: 'owners', labelDe: 'Eigentümer', domain: 'people', core: false, menuPath: '/people/owners', description: 'Eigentümer und Hausverwaltungen.' },
  { key: 'resident_portal', labelDe: 'Bewohnerportal', domain: 'communication', core: false, description: 'Eigenständiges Portal für Bewohner.' },
  { key: 'owner_portal', labelDe: 'Eigentümerportal', domain: 'communication', core: false, description: 'Eigenständiges Portal für Eigentümer.', unbuilt: true },
  { key: 'maintenance', labelDe: 'Wartungen', domain: 'tasks', core: false, menuPath: '/maintenance', description: 'Wiederkehrende Wartungs- und Prüfpläne.' },
  { key: 'checklists', labelDe: 'Checklisten', domain: 'tasks', core: false, menuPath: '/checklists', description: 'Checklisten-Builder und Ausführung.' },
  { key: 'work_reports', labelDe: 'Arbeitsberichte', domain: 'tasks', core: false, description: 'PDF-Arbeitsberichte mit Unterschrift.', unbuilt: true },
  { key: 'documents', labelDe: 'Dokumente', domain: 'resources', core: false, menuPath: '/documents', description: 'Dokumentenverwaltung mit Versionierung.' },
  { key: 'photos', labelDe: 'Fotos', domain: 'resources', core: false, description: 'Vorher/Nachher-Dokumentation.', unbuilt: true },
  { key: 'time_tracking', labelDe: 'Zeiterfassung', domain: 'field', core: false, menuPath: '/time-tracking', description: 'Arbeits-, Pausen-, Fahrzeiten.' },
  { key: 'scheduling', labelDe: 'Mitarbeiterplanung', domain: 'field', core: false, menuPath: '/schedule', description: 'Kalenderbasierte Einsatzplanung.' },
  { key: 'shifts', labelDe: 'Schichten', domain: 'field', core: false, description: 'Schichtmodelle.', unbuilt: true },
  { key: 'tours', labelDe: 'Touren', domain: 'field', core: false, menuPath: '/tours', description: 'Multi-Stopp-Tourenplanung mit Optimierung.' },
  { key: 'gps', labelDe: 'GPS & Karte', domain: 'field', core: false, menuPath: '/map', description: 'Opt-in-GPS mit 90-Tage-Retention.', unbuilt: true },
  { key: 'keys', labelDe: 'Schlüssel', domain: 'resources', core: false, menuPath: '/keys', description: 'Schlüsselverwaltung mit Ausgabe-/Rückgabelogik.' },
  { key: 'meters', labelDe: 'Zähler', domain: 'resources', core: false, menuPath: '/meters', description: 'Zählerstände und Verbrauchshistorie.' },
  { key: 'materials', labelDe: 'Material & Lager', domain: 'resources', core: false, menuPath: '/materials', description: 'Materialstamm, Bestände, Entnahmen.' },
  { key: 'vehicles', labelDe: 'Fahrzeuge', domain: 'resources', core: false, menuPath: '/vehicles', description: 'Fahrzeugverwaltung inkl. TÜV/Inspektion.' },
  { key: 'messaging', labelDe: 'Nachrichten', domain: 'communication', core: false, menuPath: '/messages', description: 'Interne Nachrichten, kontextgebunden.' },
  { key: 'announcements', labelDe: 'Ankündigungen', domain: 'communication', core: false, menuPath: '/announcements', description: 'Arbeiten und Wartungen an Bewohner ankündigen.' },
  { key: 'billing', labelDe: 'Abrechnung', domain: 'finance', core: false, menuPath: '/billing', description: 'Kosten, Rechnungen, PDF-Erstellung.' },
  { key: 'reporting', labelDe: 'Reporting', domain: 'finance', core: false, menuPath: '/reports', description: 'Analysen und Statistiken, Export PDF/Excel/CSV.' },
  { key: 'automations', labelDe: 'Automatisierungen', domain: 'platform', core: false, menuPath: '/settings/automations', description: 'Regel-Engine für Erinnerungen und Trigger.' },
  { key: 'qr_codes', labelDe: 'QR-Codes', domain: 'platform', core: false, menuPath: '/qr', description: 'QR-Codes für Objekte, Anlagen, Schlüssel.' },
] as const;

export const MODULES_BY_KEY: Record<ModuleKey, ModuleDefinition> = Object.fromEntries(
  MODULES.map((m) => [m.key, m]),
) as Record<ModuleKey, ModuleDefinition>;

export const CORE_MODULE_KEYS: readonly ModuleKey[] = MODULES.filter((m) => m.core).map((m) => m.key);

export function isCoreModule(key: ModuleKey): boolean {
  return MODULES_BY_KEY[key]?.core === true;
}

/**
 * Module, deren Seite noch nicht existiert.
 *
 * Sprint 131: abgeleitet statt gepflegt. Vorher stand diese Information an
 * zwei Stellen von Hand — als `gps` in `NOT_ENABLED_ON_SIGNUP` und als
 * `/map` in `KNOWN_MISSING_PAGES` in der Testdatei. Zwei Listen stimmen nur
 * so lange ueberein, wie jemand daran denkt.
 */
export const UNBUILT_MODULE_KEYS: readonly ModuleKey[] = MODULES.filter((m) => m.unbuilt).map(
  (m) => m.key,
);

export function isUnbuiltModule(key: ModuleKey): boolean {
  return MODULES_BY_KEY[key]?.unbuilt === true;
}

/**
 * Module, die ohne gegenteilige Angabe AN sind: alles Nicht-Kern, was
 * gebaut ist.
 *
 * Sprint 123 hat diese Menge eingefuehrt, weil `provision_signup_tenant`
 * keine einzige `tenant_modules`-Zeile anlegte und eine fehlende Zeile ein
 * AUS war. Ein frisch registrierter Hausmeisterbetrieb sah damit Dashboard,
 * Mandant, Benutzer & Rollen und Audit-Log. Keine Objekte, keine
 * Auftraege, keine Mitarbeiter. Er haette vor dem ersten Handgriff 20
 * Schalter finden und umlegen muessen; wer das nicht erraet, haelt die
 * Software fuer kaputt und ist weg.
 *
 * SPRINT 136 — DIE MENGE GILT JETZT AUCH FUER BESTANDSMANDANTEN. Sprint 123
 * hat nur den Signup-Pfad geflickt, nicht die Regel dahinter. Gemessen in
 * der Produktiv-Datenbank am 16.08.2026:
 *
 *   Hausmeisterservice   26 Zeilen, alle `true`
 *                        ES FEHLEN: resident_portal, qr_codes, reporting,
 *                        automations — vier gebaute Module, lautlos aus.
 *   Textfirma            27 Zeilen, alle `true`
 *   Firma ABC            28 Zeilen, alle `true`
 *
 * Kein einziger Mandant hatte je eine Zeile mit `enabled = false`. Und der
 * Schalter unter Einstellungen → Mandant loescht nie, er schreibt `false`
 * (siehe toggleModuleAction). "Keine Zeile" heisst in dieser Datenbank
 * also beweisbar "nie eingerichtet" — nie "abgeschaltet". Die alte Regel
 * hat beides gleich behandelt und dem aeltesten Mandanten dabei vier
 * fertige Module vorenthalten, darunter das Bewohnerportal, das er
 * nachweislich benutzt.
 *
 * Deshalb ist die Richtung jetzt ueberall "an, ausser" und nicht mehr nur
 * beim Signup: `getEnabledModules` startet bei dieser Menge und entfernt,
 * was explizit auf `false` steht. Abschalten kann der Kunde jederzeit
 * selbst; einschalten kann er nur, was er ueberhaupt zu sehen bekommt.
 *
 * Kern-Module stehen bewusst NICHT drin — sie sind ohnehin immer an, und
 * eine zusaetzliche `tenant_modules`-Zeile darauf saehe wie ein wirksamer
 * Ausschalter aus, der nichts bewirkt.
 *
 * Ungebaute Module stehen ebenfalls nicht drin. Sie brauchen weiterhin eine
 * ausdrueckliche `true`-Zeile — das haelt den Bestand von "Firma ABC"
 * unveraendert, der seit dem 16.08.2026 eine aktive `gps`-Zeile aus der
 * Zeit vor dem Signup-Riegel hat.
 */
export const DEFAULT_ON_MODULE_KEYS: readonly ModuleKey[] = MODULES.filter(
  (m) => !m.core && !m.unbuilt,
).map((m) => m.key);

/** Eine `tenant_modules`-Zeile, so weit sie fuer die Entscheidung zaehlt. */
export type ModuleToggleRow = { module_key: string; enabled: boolean };

/**
 * SPRINT 136 — DIE REGEL, NACH DER EIN MODUL AN IST.
 *
 * Bis hierher lautete sie "aus, ausser es steht eine `true`-Zeile da". Das
 * hat "der Kunde hat abgeschaltet" und "hier wurde nie etwas eingetragen"
 * zur selben Antwort zusammengezogen — und der aelteste Mandant der
 * Produktiv-Datenbank hat dadurch vier fertige Module nicht gesehen, das
 * Bewohnerportal eingeschlossen (Messung siehe DEFAULT_ON_MODULE_KEYS).
 *
 * Jetzt: an, ausser jemand hat ausdruecklich `false` hinterlegt.
 *
 * Als eigene Funktion und nicht inline in `getEnabledModules`, weil der
 * oeffentliche Melde-Link dieselbe Frage stellt
 * (`report-links/resolve.ts`), aber mit dem Service-Client und einer
 * Einzelzeile statt der ganzen Menge. Zwei Formulierungen derselben Regel
 * sind zwei Regeln, sobald sich eine von beiden aendert.
 *
 * Sie steht hier in der Registry und nicht in `enabled.ts`, weil sie reine
 * Logik ist: so muss der oeffentliche Pfad, der ohne Sitzung laeuft, keinen
 * Supabase-Server-Client mitziehen, nur um eine Zeile zu bewerten.
 *
 * Kern-Module bleiben an, auch wenn eine `false`-Zeile existiert: sie sind
 * per Definition nicht abschaltbar, und `toggleModuleAction` weist den
 * Versuch bereits ab. Eine solche Zeile kaeme nur von Hand in die
 * Datenbank und waere ein Irrtum, kein Wunsch.
 */
export function isModuleEnabledByRows(
  moduleKey: ModuleKey,
  rows: readonly ModuleToggleRow[],
): boolean {
  if (isCoreModule(moduleKey)) return true;
  const row = rows.find((r) => r.module_key === moduleKey);
  if (row) return row.enabled;
  return DEFAULT_ON_MODULE_KEYS.includes(moduleKey);
}
