import Link from 'next/link';
import { Building2, CreditCard, LayoutDashboard, Receipt, Settings, ShieldCheck, Tags } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/platform',           label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/platform/tenants',   label: 'Agenturen',   icon: Building2 },
  { href: '/platform/payments',  label: 'Zahlungen',   icon: CreditCard },
  { href: '/platform/invoices',  label: 'Rechnungen',  icon: Receipt },
  { href: '/platform/plans',     label: 'Preispläne',  icon: Tags },
  { href: '/platform/admins',    label: 'Admins',      icon: ShieldCheck },
  { href: '/platform/settings',  label: 'Einstellungen', icon: Settings },
];

export function PlatformSidebar({ appName }: { appName: string }) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-background)] md:flex md:flex-col">
      <div className="border-b border-[var(--color-border)] px-4 py-5">
        <Link href="/platform" className="flex flex-col gap-0.5">
          <span className="text-base font-semibold">{appName}</span>
          <span className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Plattform-Verwaltung
          </span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-2 py-4">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
          >
            <Icon className="size-4" aria-hidden />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="border-t border-[var(--color-border)] px-4 py-3">
        <Link
          href="/dashboard"
          className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          ← zurück zur App
        </Link>
      </div>
    </aside>
  );
}
