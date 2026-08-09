'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavGroup } from './nav-config';
import { cn } from '@/lib/utils/cn';

export function Sidebar({ groups, appName }: { groups: NavGroup[]; appName: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-background)] md:flex md:flex-col">
      <div className="flex h-14 items-center gap-3 border-b border-[var(--color-border)] px-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-sm font-semibold">
          HS
        </div>
        <span className="text-sm font-semibold">{appName}</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        {groups.map((group) => (
          <div key={group.labelDe} className="mb-4">
            <div className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
              {group.labelDe}
            </div>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href.split('?')[0] ||
                  pathname.startsWith(`${item.href.split('?')[0]}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition',
                        active
                          ? 'bg-[var(--color-accent)] text-[var(--color-primary)] font-medium'
                          : 'text-[var(--color-foreground)] hover:bg-[var(--color-muted)]',
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                      <span>{item.labelDe}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
