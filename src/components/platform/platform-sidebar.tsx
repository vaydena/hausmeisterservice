import Link from 'next/link';
import { Building2, CreditCard, Inbox, Receipt } from 'lucide-react';
import { PLATFORM_NAV_ITEMS, type PlatformNavIconKey } from './platform-nav';

const ICONS: Record<PlatformNavIconKey, typeof Inbox> = {
  inbox: Inbox,
  building: Building2,
  card: CreditCard,
  receipt: Receipt,
};

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
        {PLATFORM_NAV_ITEMS.map(({ href, label, icon }) => {
          const Icon = ICONS[icon];
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
            >
              <Icon className="size-4" aria-hidden />
              <span>{label}</span>
            </Link>
          );
        })}
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
