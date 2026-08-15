'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Megaphone, Wrench, MessageSquare, HelpCircle } from 'lucide-react';

const ITEMS = [
  { href: '/portal/dashboard', label: 'Übersicht', icon: Home, badgeKey: null },
  { href: '/portal/announcements', label: 'Ankündigungen', icon: Megaphone, badgeKey: 'announcements' },
  { href: '/portal/defects', label: 'Meldungen', icon: Wrench, badgeKey: null },
  { href: '/portal/messages', label: 'Nachrichten', icon: MessageSquare, badgeKey: 'messages' },
  { href: '/portal/hilfe', label: 'Hilfe', icon: HelpCircle, badgeKey: null },
] as const;

type BadgeKey = NonNullable<(typeof ITEMS)[number]['badgeKey']>;
type Badges = Partial<Record<BadgeKey, number>>;

export function PortalNav({ badges }: { badges?: Badges }) {
  const pathname = usePathname();

  return (
    <>
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        const Icon = item.icon;
        const badgeCount = item.badgeKey ? (badges?.[item.badgeKey] ?? 0) : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
              active
                ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]'
            }`}
          >
            <Icon className="size-4" aria-hidden />
            <span>{item.label}</span>
            {badgeCount > 0 && (
              <span
                aria-label={`${badgeCount} ungelesen`}
                className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  active
                    ? 'bg-[var(--color-primary-foreground)] text-[var(--color-primary)]'
                    : 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
                }`}
              >
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}
