'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type BadgeTone = 'primary' | 'warning' | 'neutral' | 'muted';

/**
 * Sprint 121: Kein `href` mehr. Das Feld wurde befuellt, aber nie gerendert —
 * geklickt wird der Formular-Knopf, der `openAction` ausloest, und die
 * entscheidet serverseitig ueber das Ziel. Ein mitgeschlepptes `href` legt
 * nahe, hier gaebe es einen Link, den man absichern muesste; die Pruefung
 * sitzt in der Action.
 */
export interface NotificationDropdownItem {
  id: string;
  subject: string;
  body: string | null;
  isUnread: boolean;
  relative: string;
  label: string;
  tone: BadgeTone;
}

export function NotificationBellDropdown({
  unread,
  items,
  openAction,
}: {
  unread: number;
  items: NotificationDropdownItem[];
  openAction: (formData: FormData) => Promise<void>;
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

  const displayUnread = unread > 99 ? '99+' : String(unread);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Benachrichtigungen${unread > 0 ? ` (${unread} ungelesen)` : ''}`}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 hover:bg-[var(--color-muted)]"
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 && (
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
            <span className="text-sm font-medium">Benachrichtigungen</span>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-[var(--color-primary)] hover:underline"
            >
              Alle anzeigen
            </Link>
          </div>

          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-[var(--color-muted-foreground)]">
              Keine Benachrichtigungen.
            </div>
          ) : (
            <ul className="max-h-96 divide-y divide-[var(--color-border)] overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <form action={openAction}>
                    <input type="hidden" name="notification_id" value={n.id} />
                    <button
                      type="submit"
                      onClick={() => setOpen(false)}
                      className={
                        'flex w-full flex-col gap-1 px-3 py-2 text-left text-sm hover:bg-[var(--color-muted)] ' +
                        (n.isUnread ? 'bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)]' : '')
                      }
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge tone={n.tone}>{n.label}</Badge>
                          {n.isUnread && (
                            <span
                              aria-hidden
                              className="size-2 rounded-full bg-[var(--color-primary)]"
                            />
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">
                          {n.relative}
                        </span>
                      </div>
                      <span className="line-clamp-2 font-medium">{n.subject}</span>
                      {n.body && (
                        <span className="line-clamp-2 text-xs text-[var(--color-muted-foreground)]">
                          {n.body}
                        </span>
                      )}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
