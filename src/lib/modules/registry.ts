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
  { key: 'owner_portal', labelDe: 'Eigentümerportal', domain: 'communication', core: false, description: 'Eigenständiges Portal für Eigentümer.' },
  { key: 'maintenance', labelDe: 'Wartungen', domain: 'tasks', core: false, menuPath: '/maintenance', description: 'Wiederkehrende Wartungs- und Prüfpläne.' },
  { key: 'checklists', labelDe: 'Checklisten', domain: 'tasks', core: false, menuPath: '/checklists', description: 'Checklisten-Builder und Ausführung.' },
  { key: 'work_reports', labelDe: 'Arbeitsberichte', domain: 'tasks', core: false, description: 'PDF-Arbeitsberichte mit Unterschrift.' },
  { key: 'documents', labelDe: 'Dokumente', domain: 'resources', core: false, menuPath: '/documents', description: 'Dokumentenverwaltung mit Versionierung.' },
  { key: 'photos', labelDe: 'Fotos', domain: 'resources', core: false, description: 'Vorher/Nachher-Dokumentation.' },
  { key: 'time_tracking', labelDe: 'Zeiterfassung', domain: 'field', core: false, menuPath: '/time-tracking', description: 'Arbeits-, Pausen-, Fahrzeiten.' },
  { key: 'scheduling', labelDe: 'Mitarbeiterplanung', domain: 'field', core: false, menuPath: '/schedule', description: 'Kalenderbasierte Einsatzplanung.' },
  { key: 'shifts', labelDe: 'Schichten', domain: 'field', core: false, description: 'Schichtmodelle.' },
  { key: 'tours', labelDe: 'Touren', domain: 'field', core: false, menuPath: '/tours', description: 'Multi-Stopp-Tourenplanung mit Optimierung.' },
  { key: 'gps', labelDe: 'GPS & Karte', domain: 'field', core: false, menuPath: '/map', description: 'Opt-in-GPS mit 90-Tage-Retention.' },
  { key: 'keys', labelDe: 'Schlüssel', domain: 'resources', core: false, menuPath: '/keys', description: 'Schlüsselverwaltung mit Ausgabe-/Rückgabelogik.' },
  { key: 'meters', labelDe: 'Zähler', domain: 'resources', core: false, menuPath: '/meters', description: 'Zählerstände und Verbrauchshistorie.' },
  { key: 'materials', labelDe: 'Material & Lager', domain: 'resources', core: false, menuPath: '/materials', description: 'Materialstamm, Bestände, Entnahmen.' },
  { key: 'vehicles', labelDe: 'Fahrzeuge', domain: 'resources', core: false, menuPath: '/vehicles', description: 'Fahrzeugverwaltung inkl. TÜV/Inspektion.' },
  { key: 'messaging', labelDe: 'Nachrichten', domain: 'communication', core: false, menuPath: '/messages', description: 'Interne Nachrichten, kontextgebunden.' },
  { key: 'announcements', labelDe: 'Ankündigungen', domain: 'communication', core: false, menuPath: '/announcements', description: 'Arbeiten und Wartungen an Bewohner ankündigen.' },
  { key: 'billing', labelDe: 'Abrechnung', domain: 'finance', core: false, menuPath: '/billing', description: 'Kosten, Rechnungen, PDF-Erstellung.' },
  { key: 'reporting', labelDe: 'Reporting', domain: 'finance', core: false, menuPath: '/reports', description: 'Analysen und Statistiken, Export PDF/Excel/CSV.' },
  { key: 'automations', labelDe: 'Automatisierungen', domain: 'platform', core: false, menuPath: '/settings/automations', description: 'Regel-Engine für Erinnerungen und Trigger.' },
  { key: 'qr_codes', labelDe: 'QR-Codes', domain: 'platform', core: false, description: 'QR-Codes für Objekte, Anlagen, Schlüssel.' },
] as const;

export const MODULES_BY_KEY: Record<ModuleKey, ModuleDefinition> = Object.fromEntries(
  MODULES.map((m) => [m.key, m]),
) as Record<ModuleKey, ModuleDefinition>;

export const CORE_MODULE_KEYS: readonly ModuleKey[] = MODULES.filter((m) => m.core).map((m) => m.key);

export function isCoreModule(key: ModuleKey): boolean {
  return MODULES_BY_KEY[key]?.core === true;
}

/**
 * Sprint 123 · Module, die ein NEUER Mandant beim Signup eingeschaltet
 * bekommt. Nur die Ausnahmen stehen hier — alles andere ist an.
 *
 * Warum das ueberhaupt noetig ist: `getEnabledModules` startet bei
 * `CORE_MODULE_KEYS` und ergaenzt ausschliesslich `tenant_modules`-Zeilen
 * mit `enabled = true`. Eine fehlende Zeile ist also ein AUS.
 * `provision_signup_tenant` legte keine einzige Zeile an — ein frisch
 * registrierter Hausmeisterbetrieb sah damit Dashboard, Mandant, Benutzer
 * & Rollen und Audit-Log. Keine Objekte, keine Auftraege, keine
 * Mitarbeiter. Er haette vor dem ersten Handgriff 20 Schalter unter
 * Einstellungen → Mandant finden und umlegen muessen; wer das nicht
 * erraet, haelt die Software fuer kaputt und ist weg.
 *
 * Die Richtung ist bewusst "an, ausser": in der Testphase soll der Kunde
 * das Produkt sehen, das er bewertet. Abschalten kann er jederzeit selbst,
 * einschalten kann er nur, was er kennt.
 *
 * Wer ein Modul hier ausnimmt, sagt damit: "das ist noch nicht so weit,
 * dass ein Kunde es sehen soll". Der Guard in
 * tests/nav-module-coverage.test.ts haelt das ehrlich — ein Modul, dessen
 * Seite laut KNOWN_MISSING_PAGES gar nicht existiert, darf nicht in der
 * Standardauswahl stehen.
 */
const NOT_ENABLED_ON_SIGNUP: readonly ModuleKey[] = [
  // Kein `/map` im Repo — der Menuepunkt fuehrt ins 404 (KNOWN_MISSING_PAGES).
  'gps',
];

export const SIGNUP_DEFAULT_MODULE_KEYS: readonly ModuleKey[] = MODULES.filter(
  (m) => !m.core && !NOT_ENABLED_ON_SIGNUP.includes(m.key),
).map((m) => m.key);
