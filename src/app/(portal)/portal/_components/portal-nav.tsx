'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Megaphone, Wrench, MessageSquare } from 'lucide-react';

const ITEMS = [
  { href: '/portal/dashboard', label: 'Übersicht', icon: Home },
  { href: '/portal/announcements', label: 'Ankündigungen', icon: Megaphone },
  { href: '/portal/defects', label: 'Meldungen', icon: Wrench },
  { href: '/portal/messages', label: 'Nachrichten', icon: MessageSquare },
] as const;

export function PortalNav() {
  const pathname = usePathname();

  return (
    <>
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        const Icon = item.icon;
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
          </Link>
        );
      })}
    </>
  );
}
