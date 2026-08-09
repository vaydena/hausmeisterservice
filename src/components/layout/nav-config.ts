import {
  LayoutDashboard,
  ClipboardList,
  AlertCircle,
  Wrench,
  ListChecks,
  Building2,
  DoorOpen,
  Users,
  Home,
  UserCog,
  Clock,
  CalendarRange,
  Route as RouteIcon,
  Map,
  Key,
  Gauge,
  Package,
  Car,
  FileText,
  MessageSquare,
  Megaphone,
  Bell,
  Mail,
  Receipt,
  BarChart3,
  Settings,
  Zap,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { ModuleKey } from '@/lib/modules/registry';
import type { PermissionKey } from '@/lib/permissions/registry';

export interface NavItem {
  href: string;
  labelDe: string;
  icon: LucideIcon;
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
      { href: '/dashboard', labelDe: 'Dashboard', icon: LayoutDashboard, module: 'core.dashboard', permission: null },
    ],
  },
  {
    labelDe: 'Aufgaben',
    items: [
      { href: '/work-orders', labelDe: 'Aufträge', icon: ClipboardList, module: 'work_orders', permission: 'work_orders.view' },
      { href: '/defect-reports', labelDe: 'Meldungen', icon: AlertCircle, module: 'defect_reports', permission: 'defect_reports.view' },
      { href: '/maintenance', labelDe: 'Wartungen', icon: Wrench, module: 'maintenance', permission: 'maintenance.view' },
      { href: '/checklists', labelDe: 'Checklisten', icon: ListChecks, module: 'checklists', permission: 'checklists.view' },
    ],
  },
  {
    labelDe: 'Objekte',
    items: [
      { href: '/properties', labelDe: 'Objekte', icon: Building2, module: 'properties', permission: 'properties.view' },
      { href: '/keys', labelDe: 'Schlüssel', icon: Key, module: 'keys', permission: 'keys.view' },
      { href: '/meters', labelDe: 'Zähler', icon: Gauge, module: 'meters', permission: 'meters.view' },
    ],
  },
  {
    labelDe: 'Personen',
    items: [
      { href: '/people/employees', labelDe: 'Mitarbeiter', icon: UserCog, module: 'employees', permission: 'employees.view' },
      { href: '/people/residents', labelDe: 'Bewohner', icon: Users, module: 'residents', permission: 'residents.view' },
      { href: '/people/owners', labelDe: 'Eigentümer', icon: Home, module: 'owners', permission: 'owners.view' },
    ],
  },
  {
    labelDe: 'Einsatz',
    items: [
      { href: '/time-tracking', labelDe: 'Zeiterfassung', icon: Clock, module: 'time_tracking', permission: 'time_tracking.view' },
      { href: '/time-corrections', labelDe: 'Korrekturanträge', icon: ClipboardList, module: 'time_tracking', permission: 'time_tracking.view' },
      { href: '/schedule', labelDe: 'Planung', icon: CalendarRange, module: 'scheduling', permission: 'scheduling.view' },
      { href: '/tours', labelDe: 'Touren', icon: RouteIcon, module: 'tours', permission: 'tours.view' },
      { href: '/map', labelDe: 'Karte', icon: Map, module: 'gps', permission: 'gps.view' },
    ],
  },
  {
    labelDe: 'Ressourcen',
    items: [
      { href: '/materials', labelDe: 'Material', icon: Package, module: 'materials', permission: 'materials.view' },
      { href: '/vehicles', labelDe: 'Fahrzeuge', icon: Car, module: 'vehicles', permission: 'vehicles.view' },
      { href: '/documents', labelDe: 'Dokumente', icon: FileText, module: 'documents', permission: 'documents.view' },
    ],
  },
  {
    labelDe: 'Kommunikation',
    items: [
      { href: '/messages', labelDe: 'Nachrichten', icon: MessageSquare, module: 'messaging', permission: 'messaging.view' },
      { href: '/announcements', labelDe: 'Ankündigungen', icon: Megaphone, module: 'announcements', permission: 'announcements.view' },
    ],
  },
  {
    labelDe: 'Finanzen',
    items: [
      { href: '/billing', labelDe: 'Abrechnung', icon: Receipt, module: 'billing', permission: 'billing.view' },
      { href: '/reports', labelDe: 'Reporting', icon: BarChart3, module: 'reporting', permission: 'reporting.view' },
    ],
  },
  {
    labelDe: 'Einstellungen',
    items: [
      { href: '/settings/tenant', labelDe: 'Mandant', icon: Settings, module: 'core.tenants', permission: 'core.tenants.view' },
      { href: '/settings/users', labelDe: 'Benutzer & Rollen', icon: Users, module: 'core.users_roles', permission: 'core.users_roles.view' },
      { href: '/settings/automations', labelDe: 'Automatisierungen', icon: Zap, module: 'automations', permission: 'automations.view' },
      { href: '/settings/emails', labelDe: 'E-Mail-Log', icon: Mail, module: null, permission: 'billing.view' },
      { href: '/settings/notifications', labelDe: 'Benachrichtigungen', icon: Bell, module: null, permission: null },
      { href: '/settings/audit', labelDe: 'Audit-Log', icon: ShieldCheck, module: 'core.audit_log', permission: 'core.audit_log.view' },
    ],
  },
] as const;

export const MOBILE_NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', labelDe: 'Start', icon: Home, module: 'core.dashboard', permission: null },
  { href: '/work-orders', labelDe: 'Aufträge', icon: ClipboardList, module: 'work_orders', permission: 'work_orders.view' },
  { href: '/time-tracking', labelDe: 'Zeit', icon: Clock, module: 'time_tracking', permission: 'time_tracking.view' },
  { href: '/messages', labelDe: 'Nachrichten', icon: MessageSquare, module: 'messaging', permission: 'messaging.view' },
  { href: '/settings/tenant', labelDe: 'Mehr', icon: Settings, module: null, permission: null },
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
