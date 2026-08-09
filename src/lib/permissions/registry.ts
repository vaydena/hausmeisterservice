/**
 * Permission Registry — single source of truth for permissions per MASTER_PROMPT §4.
 *
 * Format: `<module>.<action>`.
 * Actions follow a fixed verb set: view, create, edit, delete, assign, close,
 * approve, download, manage, view_others.
 *
 * Permissions are code-defined (immutable, versioned with the app). Roles bundle
 * them and are freely configurable per tenant. Objekt-/Standort-Scope wird beim
 * Role-Assignment (user_roles.scope_type/scope_id) hinterlegt, nicht hier.
 */

import type { ModuleKey } from '@/lib/modules/registry';

export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'assign'
  | 'close'
  | 'approve'
  | 'download'
  | 'manage'
  | 'publish'
  | 'view_others';

export type PermissionKey = string; // `${ModuleKey}.${PermissionAction}` plus a few specials

export interface PermissionDefinition {
  key: PermissionKey;
  module: ModuleKey;
  action: PermissionAction;
  labelDe: string;
  description: string;
  scopable: boolean; // ob Property-/Building-Scope die Permission einschränken darf
}

function p(
  module: ModuleKey,
  action: PermissionAction,
  labelDe: string,
  description: string,
  scopable = true,
): PermissionDefinition {
  return { key: `${module}.${action}`, module, action, labelDe, description, scopable };
}

export const PERMISSIONS: readonly PermissionDefinition[] = [
  // Tenant / Settings
  p('core.tenants', 'view', 'Mandant ansehen', 'Unternehmensdaten und Einstellungen sehen.', false),
  p('core.tenants', 'edit', 'Mandant bearbeiten', 'Unternehmensdaten, Branding, Nummernkreise ändern.', false),
  p('core.tenants', 'manage', 'Module verwalten', 'Module aktivieren/deaktivieren.', false),

  // Users & Roles
  p('core.users_roles', 'view', 'Benutzer ansehen', 'Benutzerliste und Zuweisungen einsehen.', false),
  p('core.users_roles', 'create', 'Benutzer einladen', 'Neue Benutzer einladen und Rollen zuweisen.', false),
  p('core.users_roles', 'edit', 'Benutzer bearbeiten', 'Rollen, Scopes, Aktivierungsstatus ändern.', false),
  p('core.users_roles', 'delete', 'Benutzer entfernen', 'Benutzer aus dem Mandanten entfernen.', false),
  p('core.users_roles', 'manage', 'Rollen verwalten', 'Rollen anlegen, bearbeiten, Rechte zuordnen.', false),

  // Audit Log
  p('core.audit_log', 'view', 'Audit-Log einsehen', 'Änderungshistorie einsehen.', false),

  // Properties
  p('properties', 'view', 'Objekte ansehen', 'Liegenschaften, Gebäude, Einheiten einsehen.'),
  p('properties', 'create', 'Objekt anlegen', 'Neue Liegenschaft oder Gebäude anlegen.'),
  p('properties', 'edit', 'Objekt bearbeiten', 'Stammdaten, Ansprechpartner, Zugangshinweise ändern.'),
  p('properties', 'delete', 'Objekt löschen', 'Objekt entfernen (Soft-Delete).'),

  // Employees
  p('employees', 'view', 'Mitarbeiter ansehen', 'Mitarbeiterliste und Profile sehen.', false),
  p('employees', 'create', 'Mitarbeiter anlegen', 'Neuen Mitarbeiter anlegen.', false),
  p('employees', 'edit', 'Mitarbeiter bearbeiten', 'Stammdaten, Skills, Stundensatz ändern.', false),
  p('employees', 'delete', 'Mitarbeiter deaktivieren', 'Mitarbeiter deaktivieren.', false),

  // Work Orders
  p('work_orders', 'view', 'Aufträge ansehen', 'Aufträge in eigenem Zuständigkeitsbereich sehen.'),
  p('work_orders', 'create', 'Auftrag erstellen', 'Neuen Auftrag anlegen.'),
  p('work_orders', 'edit', 'Auftrag bearbeiten', 'Auftragsdaten, Termine, Priorität ändern.'),
  p('work_orders', 'assign', 'Auftrag zuweisen', 'Mitarbeiter oder Team zuweisen.'),
  p('work_orders', 'close', 'Auftrag abschließen', 'Auftrag als erledigt markieren.'),
  p('work_orders', 'delete', 'Auftrag löschen', 'Auftrag entfernen (Soft-Delete).'),

  // Defect Reports
  p('defect_reports', 'view', 'Meldungen ansehen', 'Eingehende Mängelmeldungen einsehen.'),
  p('defect_reports', 'create', 'Meldung erfassen', 'Mängelmeldung erstellen (auch als Bewohner).'),
  p('defect_reports', 'edit', 'Meldung bearbeiten', 'Meldung prüfen, priorisieren, in Auftrag überführen.'),

  // Residents
  p('residents', 'view', 'Bewohner ansehen', 'Bewohnerliste und Profile sehen.'),
  p('residents', 'create', 'Bewohner anlegen', 'Neuen Bewohner anlegen.'),
  p('residents', 'edit', 'Bewohner bearbeiten', 'Stammdaten ändern.'),
  p('residents', 'delete', 'Bewohner entfernen', 'Bewohner entfernen (Soft-Delete).'),

  // Owners
  p('owners', 'view', 'Eigentümer ansehen', 'Eigentümer und Hausverwaltungen sehen.'),
  p('owners', 'create', 'Eigentümer anlegen', 'Neuen Eigentümer anlegen.'),
  p('owners', 'edit', 'Eigentümer bearbeiten', 'Stammdaten und Kontaktinfos ändern.'),
  p('owners', 'delete', 'Eigentümer entfernen', 'Eigentümer entfernen.'),

  // Portale
  p('resident_portal', 'view', 'Bewohnerportal nutzen', 'Zugriff auf Bewohner-Startseite und -Funktionen.'),
  p('owner_portal', 'view', 'Eigentümerportal nutzen', 'Zugriff auf Eigentümer-Dashboard.'),
  p('owner_portal', 'download', 'Berichte herunterladen', 'PDF-Berichte im Eigentümerportal laden.'),

  // Maintenance
  p('maintenance', 'view', 'Wartungen ansehen', 'Wartungspläne und -instanzen einsehen.'),
  p('maintenance', 'create', 'Wartungsplan anlegen', 'Neuen Wartungsplan definieren.'),
  p('maintenance', 'edit', 'Wartungsplan bearbeiten', 'Intervalle, Zuständige ändern.'),
  p('maintenance', 'delete', 'Wartungsplan entfernen', 'Wartungsplan entfernen.'),

  // Checklists
  p('checklists', 'view', 'Checklisten ansehen', 'Vorlagen und Ausführungen einsehen.'),
  p('checklists', 'create', 'Checkliste erstellen', 'Neue Vorlage anlegen.'),
  p('checklists', 'edit', 'Checkliste bearbeiten', 'Vorlage ändern.'),
  p('checklists', 'delete', 'Checkliste löschen', 'Vorlage entfernen.'),

  // Work Reports
  p('work_reports', 'view', 'Arbeitsberichte ansehen', 'Berichte einsehen.'),
  p('work_reports', 'create', 'Arbeitsbericht schreiben', 'Neuen Bericht zu einem Auftrag anlegen.'),
  p('work_reports', 'edit', 'Arbeitsbericht bearbeiten', 'Bericht ändern (bis zur Freigabe).'),
  p('work_reports', 'approve', 'Bericht freigeben', 'Bericht final freigeben.'),
  p('work_reports', 'download', 'Bericht herunterladen', 'PDF laden.'),

  // Documents
  p('documents', 'view', 'Dokumente ansehen', 'Dokumente einsehen.'),
  p('documents', 'create', 'Dokument hochladen', 'Neues Dokument hochladen.'),
  p('documents', 'edit', 'Dokument bearbeiten', 'Metadaten, Kategorie, Version ändern.'),
  p('documents', 'delete', 'Dokument löschen', 'Dokument entfernen (Versionshistorie bleibt).'),
  p('documents', 'download', 'Dokument herunterladen', 'Datei laden.'),

  // Photos
  p('photos', 'view', 'Fotos ansehen', 'Fotos einsehen.'),
  p('photos', 'create', 'Foto aufnehmen/hochladen', 'Neues Foto anhängen.'),
  p('photos', 'delete', 'Foto löschen', 'Foto entfernen.'),

  // Time Tracking
  p('time_tracking', 'view', 'Zeiterfassung ansehen', 'Eigene Zeiten einsehen.', false),
  p('time_tracking', 'create', 'Zeit erfassen', 'Zeiten stempeln oder manuell erfassen.', false),
  p('time_tracking', 'edit', 'Zeit korrigieren', 'Eigene Zeiten korrigieren (Antrag).', false),
  p('time_tracking', 'view_others', 'Fremde Zeiten ansehen', 'Zeiten anderer Mitarbeiter einsehen.'),
  p('time_tracking', 'approve', 'Zeitkorrekturen freigeben', 'Korrekturanträge genehmigen.'),

  // Scheduling / Shifts
  p('scheduling', 'view', 'Planung ansehen', 'Planung/Kalender einsehen.'),
  p('scheduling', 'edit', 'Planung bearbeiten', 'Einsätze anlegen, verschieben, zuweisen.'),
  p('shifts', 'manage', 'Schichten verwalten', 'Schichtmodelle definieren.', false),

  // Tours
  p('tours', 'view', 'Touren ansehen', 'Touren einsehen.'),
  p('tours', 'create', 'Tour erstellen', 'Neue Tour planen.'),
  p('tours', 'edit', 'Tour bearbeiten', 'Stopps, Reihenfolge ändern.'),

  // GPS
  p('gps', 'view', 'Eigene Position sehen', 'Eigenen GPS-Track sehen.', false),
  p('gps', 'view_others', 'Mitarbeiter-Positionen sehen', 'GPS anderer Mitarbeiter einsehen (Disponent).'),

  // Keys
  p('keys', 'view', 'Schlüssel ansehen', 'Schlüsselstamm und Vorgänge einsehen.'),
  p('keys', 'create', 'Schlüssel anlegen', 'Neuen Schlüssel erfassen.'),
  p('keys', 'edit', 'Schlüssel bearbeiten', 'Status, Standort, Zuordnung ändern.'),
  p('keys', 'assign', 'Schlüssel ausgeben/zurücknehmen', 'Ausgabe/Rückgabe protokollieren.'),

  // Meters
  p('meters', 'view', 'Zähler ansehen', 'Zählerstamm und Historie einsehen.'),
  p('meters', 'create', 'Zähler anlegen', 'Neuen Zähler erfassen.'),
  p('meters', 'edit', 'Zählerstand erfassen', 'Neuen Zählerstand hinzufügen.'),

  // Materials
  p('materials', 'view', 'Material ansehen', 'Bestand und Bewegungen einsehen.'),
  p('materials', 'create', 'Material anlegen', 'Neuen Artikel anlegen.'),
  p('materials', 'edit', 'Material bearbeiten', 'Stammdaten, Bestandskorrektur.'),
  p('materials', 'assign', 'Material entnehmen', 'Auftrag zuordnen und ausbuchen.'),

  // Vehicles
  p('vehicles', 'view', 'Fahrzeuge ansehen', 'Fahrzeugstamm einsehen.', false),
  p('vehicles', 'create', 'Fahrzeug anlegen', 'Neues Fahrzeug erfassen.', false),
  p('vehicles', 'edit', 'Fahrzeug bearbeiten', 'Stammdaten, Fristen, Fahrer.', false),

  // Messaging / Announcements
  p('messaging', 'view', 'Nachrichten ansehen', 'Zugewiesene Nachrichten sehen.', false),
  p('messaging', 'create', 'Nachricht senden', 'Neue Nachricht schreiben.', false),
  p('announcements', 'view', 'Ankündigungen ansehen', 'Bekanntmachungen einsehen und quittieren.'),
  p('announcements', 'create', 'Ankündigung erstellen', 'Entwürfe für Bekanntmachungen anlegen.'),
  p('announcements', 'edit', 'Ankündigung bearbeiten', 'Eigene Entwürfe bearbeiten.'),
  p('announcements', 'publish', 'Ankündigung veröffentlichen', 'Entwürfe veröffentlichen und Empfänger-Quittungen einsehen.', false),
  p('announcements', 'close', 'Ankündigung schließen', 'Veröffentlichte Bekanntmachungen als geschlossen markieren.', false),

  // Billing
  p('billing', 'view', 'Kosten/Rechnungen ansehen', 'Kosten und Rechnungen einsehen.'),
  p('billing', 'create', 'Rechnung erstellen', 'Rechnungsentwurf anlegen.'),
  p('billing', 'edit', 'Rechnung bearbeiten', 'Positionen, Empfänger ändern.'),
  p('billing', 'approve', 'Rechnung freigeben', 'Freigabe zur Versendung.'),
  p('billing', 'download', 'Rechnung herunterladen', 'PDF laden.'),

  // Reporting
  p('reporting', 'view', 'Reports ansehen', 'Reports und Statistiken einsehen.', false),
  p('reporting', 'download', 'Reports exportieren', 'PDF/Excel/CSV exportieren.', false),

  // Automations
  p('automations', 'view', 'Automatisierungen ansehen', 'Regeln einsehen.', false),
  p('automations', 'manage', 'Automatisierungen verwalten', 'Regeln anlegen, ändern, aktivieren.', false),
] as const;

export const PERMISSIONS_BY_KEY: Record<PermissionKey, PermissionDefinition> = Object.fromEntries(
  PERMISSIONS.map((perm) => [perm.key, perm]),
);

export function permissionsForModule(module: ModuleKey): PermissionDefinition[] {
  return PERMISSIONS.filter((perm) => perm.module === module);
}

/**
 * Startvorlagen der System-Rollen. Die Rollen selbst sind editierbar (außer
 * `superadmin`); Vorlagen werden nur beim Tenant-Onboarding einmalig gesetzt.
 */
export type SystemRoleKey =
  | 'superadmin'
  | 'admin'
  | 'objektleiter'
  | 'disponent'
  | 'hausmeister'
  | 'technik'
  | 'reinigung'
  | 'winterdienst'
  | 'gaertner'
  | 'fahrer'
  | 'buchhaltung'
  | 'eigentuemer'
  | 'hausverwaltung'
  | 'bewohner'
  | 'externer_dienstleister';

export interface SystemRoleTemplate {
  key: SystemRoleKey;
  nameDe: string;
  description: string;
  permissions: PermissionKey[] | '*'; // '*' = alle Permissions (superadmin)
  editable: boolean;
}

const FIELD_STAFF_BASE: PermissionKey[] = [
  'work_orders.view',
  'work_orders.edit',
  'work_orders.close',
  'work_reports.view',
  'work_reports.create',
  'work_reports.edit',
  'work_reports.download',
  'checklists.view',
  'documents.view',
  'documents.download',
  'photos.view',
  'photos.create',
  'time_tracking.view',
  'time_tracking.create',
  'time_tracking.edit',
  'materials.view',
  'materials.assign',
  'keys.view',
  'keys.assign',
  'meters.view',
  'meters.edit',
  'messaging.view',
  'messaging.create',
  'announcements.view',
  'gps.view',
];

export const SYSTEM_ROLE_TEMPLATES: readonly SystemRoleTemplate[] = [
  {
    key: 'superadmin',
    nameDe: 'Superadministrator',
    description: 'Volle Kontrolle über den Mandanten. Nicht editierbar.',
    permissions: '*',
    editable: false,
  },
  {
    key: 'admin',
    nameDe: 'Administrator',
    description: 'Verwaltet Mandant, Module, Rollen und Betrieb.',
    permissions: PERMISSIONS.map((perm) => perm.key),
    editable: true,
  },
  {
    key: 'objektleiter',
    nameDe: 'Objektleiter',
    description: 'Verantwortlich für einzelne Liegenschaften.',
    permissions: [
      'properties.view',
      'properties.edit',
      'work_orders.view',
      'work_orders.create',
      'work_orders.edit',
      'work_orders.assign',
      'work_orders.close',
      'defect_reports.view',
      'defect_reports.edit',
      'maintenance.view',
      'maintenance.create',
      'maintenance.edit',
      'checklists.view',
      'residents.view',
      'residents.edit',
      'owners.view',
      'work_reports.view',
      'work_reports.approve',
      'documents.view',
      'documents.create',
      'documents.edit',
      'documents.download',
      'photos.view',
      'time_tracking.view_others',
      'time_tracking.approve',
      'scheduling.view',
      'scheduling.edit',
      'tours.view',
      'tours.edit',
      'keys.view',
      'meters.view',
      'materials.view',
      'vehicles.view',
      'messaging.view',
      'messaging.create',
      'announcements.view',
      'announcements.create',
      'announcements.edit',
      'announcements.publish',
      'announcements.close',
      'billing.view',
      'reporting.view',
      'reporting.download',
    ],
    editable: true,
  },
  {
    key: 'disponent',
    nameDe: 'Disponent',
    description: 'Plant Einsätze, Touren, Schichten und weist Aufträge zu.',
    permissions: [
      'properties.view',
      'employees.view',
      'work_orders.view',
      'work_orders.create',
      'work_orders.edit',
      'work_orders.assign',
      'defect_reports.view',
      'defect_reports.edit',
      'maintenance.view',
      'scheduling.view',
      'scheduling.edit',
      'shifts.manage',
      'tours.view',
      'tours.create',
      'tours.edit',
      'gps.view_others',
      'time_tracking.view_others',
      'messaging.view',
      'messaging.create',
      'announcements.view',
      'announcements.create',
      'announcements.publish',
    ],
    editable: true,
  },
  { key: 'hausmeister', nameDe: 'Hausmeister', description: 'Führt Aufträge, Kontrollen und Wartungen aus.', permissions: FIELD_STAFF_BASE, editable: true },
  { key: 'technik', nameDe: 'Technischer Mitarbeiter', description: 'Wartung und Reparatur technischer Anlagen.', permissions: FIELD_STAFF_BASE, editable: true },
  { key: 'reinigung', nameDe: 'Reinigungskraft', description: 'Reinigungsaufträge und Checklisten.', permissions: FIELD_STAFF_BASE, editable: true },
  { key: 'winterdienst', nameDe: 'Winterdienst-Mitarbeiter', description: 'Räum- und Streudienst mit Dokumentation.', permissions: FIELD_STAFF_BASE, editable: true },
  { key: 'gaertner', nameDe: 'Gärtner', description: 'Grünanlagenpflege.', permissions: FIELD_STAFF_BASE, editable: true },
  {
    key: 'fahrer',
    nameDe: 'Fahrer',
    description: 'Fahrzeugführer mit Fahrtenbuch.',
    permissions: [
      ...FIELD_STAFF_BASE,
      'vehicles.view',
      'vehicles.edit',
    ],
    editable: true,
  },
  {
    key: 'buchhaltung',
    nameDe: 'Buchhaltung',
    description: 'Kosten- und Rechnungsverwaltung.',
    permissions: [
      'properties.view',
      'owners.view',
      'work_orders.view',
      'work_reports.view',
      'work_reports.download',
      'documents.view',
      'documents.create',
      'documents.download',
      'billing.view',
      'billing.create',
      'billing.edit',
      'billing.approve',
      'billing.download',
      'reporting.view',
      'reporting.download',
    ],
    editable: true,
  },
  {
    key: 'eigentuemer',
    nameDe: 'Eigentümer',
    description: 'Externer Zugriff via Eigentümerportal.',
    permissions: ['owner_portal.view', 'owner_portal.download'],
    editable: true,
  },
  {
    key: 'hausverwaltung',
    nameDe: 'Hausverwaltung',
    description: 'Externer Zugriff via Eigentümerportal + Meldeworkflow.',
    permissions: [
      'owner_portal.view',
      'owner_portal.download',
      'defect_reports.create',
      'defect_reports.view',
      'documents.view',
      'documents.download',
    ],
    editable: true,
  },
  {
    key: 'bewohner',
    nameDe: 'Bewohner',
    description: 'Externer Zugriff via Bewohnerportal.',
    permissions: ['resident_portal.view', 'defect_reports.create', 'defect_reports.view', 'announcements.view'],
    editable: true,
  },
  {
    key: 'externer_dienstleister',
    nameDe: 'Externer Dienstleister',
    description: 'Zugriff auf zugewiesene Aufträge und Berichte.',
    permissions: [
      'work_orders.view',
      'work_orders.edit',
      'work_orders.close',
      'work_reports.view',
      'work_reports.create',
      'work_reports.download',
      'photos.view',
      'photos.create',
      'documents.view',
      'documents.download',
    ],
    editable: true,
  },
] as const;
