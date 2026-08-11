'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from './nav-config';
import { NavIcon } from './nav-icons';
import { cn } from '@/lib/utils/cn';

export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  if (items.length === 0) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-background)] md:hidden"
      aria-label="Hauptnavigation"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const base = item.href.split('?')[0];
          const active = pathname === base || pathname.startsWith(`${base}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 py-2 text-xs transition',
                  active
                    ? 'text-[var(--color-primary)]'
                    : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
                )}
              >
                <NavIcon name={item.icon} className="size-5" />
                <span>{item.labelDe}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
