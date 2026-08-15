'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Megaphone, MessageSquare } from 'lucide-react';

export interface PortalBellDropdownItem {
  id: string;
  kind: 'message' | 'announcement';
  title: string;
  href: string;
  relative: string;
  needsAck: boolean;
}

export function PortalNotificationBellDropdown({
  unreadCount,
  items,
}: {
  unreadCount: number;
  items: PortalBellDropdownItem[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const displayUnread = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Benachrichtigungen${unreadCount > 0 ? ` (${unreadCount} ungelesen)` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 hover:bg-[var(--color-muted)]"
      >
        <Bell className="size-4" aria-hidden />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--color-destructive)] px-1 text-[10px] font-semibold leading-4 text-white"
          >
            {displayUnread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-50 w-80 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] shadow-md sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
            <span className="text-sm font-medium">Neu für Sie</span>
            <div className="flex gap-3 text-xs">
              <Link
                href="/portal/messages"
                onClick={() => setOpen(false)}
                className="text-[var(--color-primary)] hover:underline"
              >
                Nachrichten
              </Link>
              <Link
                href="/portal/announcements"
                onClick={() => setOpen(false)}
                className="text-[var(--color-primary)] hover:underline"
              >
                Ankündigungen
              </Link>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-[var(--color-muted-foreground)]">
              Alles gelesen.
            </div>
          ) : (
            <ul className="max-h-96 divide-y divide-[var(--color-border)] overflow-y-auto">
              {items.map((n) => {
                const Icon = n.kind === 'message' ? MessageSquare : Megaphone;
                return (
                  <li key={`${n.kind}:${n.id}`}>
                    <Link
                      href={n.href}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--color-muted)]"
                    >
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                        <Icon className="size-3.5" aria-hidden />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
                            {n.kind === 'message' ? 'Nachricht' : 'Ankündigung'}
                          </span>
                          <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">
                            {n.relative}
                          </span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 font-medium">{n.title}</span>
                        {n.needsAck && (
                          <span className="mt-1 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                            quittieren
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
