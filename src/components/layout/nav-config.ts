import type { ModuleKey } from '@/lib/modules/registry';
import type { PermissionKey } from '@/lib/permissions/registry';
import type { NavIconKey } from './nav-icons';

// Icons werden als String-Keys gespeichert, damit die Nav-Konfiguration
// als Prop von Server- an Client-Komponenten übergeben werden kann
// (React verbietet das Serialisieren von Funktionen/Komponenten).
export interface NavItem {
  href: string;
  labelDe: string;
  icon: NavIconKey;
  module: ModuleKey | null; // null = immer sichtbar (Dashboard)
  permission: PermissionKey | null; // null = keine Permission-Prüfung
}

export interface NavGroup {
  labelDe: string;
  items: NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    labelDe: 'Übersicht',
    items: [
      { href: '/dashboard', labelDe: 'Dashboard', icon: 'layout-dashboard', module: 'core.dashboard', permission: null },
    ],
  },
  {
    labelDe: 'Aufgaben',
    items: [
      { href: '/work-orders', labelDe: 'Aufträge', icon: 'clipboard-list', module: 'work_orders', permission: 'work_orders.view' },
      { href: '/defect-reports', labelDe: 'Meldungen', icon: 'alert-circle', module: 'defect_reports', permission: 'defect_reports.view' },
      { href: '/maintenance', labelDe: 'Wartungen', icon: 'wrench', module: 'maintenance', permission: 'maintenance.view' },
      { href: '/checklists', labelDe: 'Checklisten', icon: 'list-checks', module: 'checklists', permission: 'checklists.view' },
    ],
  },
  {
    labelDe: 'Objekte',
    items: [
      { href: '/properties', labelDe: 'Objekte', icon: 'building-2', module: 'properties', permission: 'properties.view' },
      { href: '/keys', labelDe: 'Schlüssel', icon: 'key', module: 'keys', permission: 'keys.view' },
      { href: '/meters', labelDe: 'Zähler', icon: 'gauge', module: 'meters', permission: 'meters.view' },
    ],
  },
  {
    labelDe: 'Personen',
    items: [
      { href: '/people/employees', labelDe: 'Mitarbeiter', icon: 'user-cog', module: 'employees', permission: 'employees.view' },
      { href: '/people/residents', labelDe: 'Bewohner', icon: 'users', module: 'residents', permission: 'residents.view' },
      { href: '/people/owners', labelDe: 'Eigentümer', icon: 'home', module: 'owners', permission: 'owners.view' },
    ],
  },
  {
    labelDe: 'Einsatz',
    items: [
      { href: '/time-tracking', labelDe: 'Zeiterfassung', icon: 'clock', module: 'time_tracking', permission: 'time_tracking.view' },
      { href: '/time-corrections', labelDe: 'Korrekturanträge', icon: 'clipboard-list', module: 'time_tracking', permission: 'time_tracking.view' },
      { href: '/schedule', labelDe: 'Planung', icon: 'calendar-range', module: 'scheduling', permission: 'scheduling.view' },
      { href: '/tours', labelDe: 'Touren', icon: 'route', module: 'tours', permission: 'tours.view' },
      { href: '/map', labelDe: 'Karte', icon: 'map', module: 'gps', permission: 'gps.view' },
    ],
  },
  {
    labelDe: 'Ressourcen',
    items: [
      { href: '/materials', labelDe: 'Material', icon: 'package', module: 'materials', permission: 'materials.view' },
      { href: '/vehicles', labelDe: 'Fahrzeuge', icon: 'car', module: 'vehicles', permission: 'vehicles.view' },
      { href: '/documents', labelDe: 'Dokumente', icon: 'file-text', module: 'documents', permission: 'documents.view' },
    ],
  },
  {
    labelDe: 'Kommunikation',
    items: [
      { href: '/messages', labelDe: 'Nachrichten', icon: 'message-square', module: 'messaging', permission: 'messaging.view' },
      { href: '/announcements', labelDe: 'Ankündigungen', icon: 'megaphone', module: 'announcements', permission: 'announcements.view' },
    ],
  },
  {
    labelDe: 'Finanzen',
    items: [
      { href: '/billing', labelDe: 'Abrechnung', icon: 'receipt', module: 'billing', permission: 'billing.view' },
      { href: '/reports', labelDe: 'Reporting', icon: 'bar-chart-3', module: 'reporting', permission: 'reporting.view' },
    ],
  },
  {
    labelDe: 'Einstellungen',
    items: [
      { href: '/settings/tenant', labelDe: 'Mandant', icon: 'settings', module: 'core.tenants', permission: 'core.tenants.view' },
      { href: '/settings/users', labelDe: 'Benutzer & Rollen', icon: 'users', module: 'core.users_roles', permission: 'core.users_roles.view' },
      { href: '/settings/automations', labelDe: 'Automatisierungen', icon: 'zap', module: 'automations', permission: 'automations.view' },
      { href: '/settings/emails', labelDe: 'E-Mail-Log', icon: 'mail', module: null, permission: 'billing.view' },
      { href: '/settings/notifications', labelDe: 'Benachrichtigungen', icon: 'bell', module: null, permission: null },
      { href: '/settings/audit', labelDe: 'Audit-Log', icon: 'shield-check', module: 'core.audit_log', permission: 'core.audit_log.view' },
    ],
  },
] as const;

export const MOBILE_NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', labelDe: 'Start', icon: 'home', module: 'core.dashboard', permission: null },
  { href: '/work-orders', labelDe: 'Aufträge', icon: 'clipboard-list', module: 'work_orders', permission: 'work_orders.view' },
  { href: '/time-tracking', labelDe: 'Zeit', icon: 'clock', module: 'time_tracking', permission: 'time_tracking.view' },
  { href: '/messages', labelDe: 'Nachrichten', icon: 'message-square', module: 'messaging', permission: 'messaging.view' },
  { href: '/settings/tenant', labelDe: 'Mehr', icon: 'settings', module: null, permission: null },
] as const;

export function filterNavGroups(
  groups: readonly NavGroup[],
  enabledModules: Set<ModuleKey>,
  permissions: Set<PermissionKey>,
): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isVisible(item, enabledModules, permissions)),
    }))
    .filter((group) => group.items.length > 0);
}

export function filterNavItems(
  items: readonly NavItem[],
  enabledModules: Set<ModuleKey>,
  permissions: Set<PermissionKey>,
): NavItem[] {
  return items.filter((item) => isVisible(item, enabledModules, permissions));
}

function isVisible(
  item: NavItem,
  enabledModules: Set<ModuleKey>,
  permissions: Set<PermissionKey>,
): boolean {
  if (item.module && !enabledModules.has(item.module)) return false;
  if (item.permission && !permissions.has(item.permission)) return false;
  return true;
}
