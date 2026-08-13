'use client';

import {
  LayoutDashboard,
  ClipboardList,
  AlertCircle,
  Wrench,
  ListChecks,
  Building2,
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
  CreditCard,
  LifeBuoy,
  Lock,
  type LucideIcon,
} from 'lucide-react';

export const NAV_ICONS = {
  'layout-dashboard': LayoutDashboard,
  'clipboard-list': ClipboardList,
  'alert-circle': AlertCircle,
  wrench: Wrench,
  'list-checks': ListChecks,
  'building-2': Building2,
  users: Users,
  home: Home,
  'user-cog': UserCog,
  clock: Clock,
  'calendar-range': CalendarRange,
  route: RouteIcon,
  map: Map,
  key: Key,
  gauge: Gauge,
  package: Package,
  car: Car,
  'file-text': FileText,
  'message-square': MessageSquare,
  megaphone: Megaphone,
  bell: Bell,
  mail: Mail,
  receipt: Receipt,
  'bar-chart-3': BarChart3,
  settings: Settings,
  zap: Zap,
  'shield-check': ShieldCheck,
  'credit-card': CreditCard,
  'life-buoy': LifeBuoy,
  lock: Lock,
} as const satisfies Record<string, LucideIcon>;

export type NavIconKey = keyof typeof NAV_ICONS;

export function NavIcon({
  name,
  className,
}: {
  name: NavIconKey;
  className?: string;
}) {
  const Icon = NAV_ICONS[name];
  return <Icon className={className} aria-hidden />;
}
