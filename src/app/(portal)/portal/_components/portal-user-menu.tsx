'use client';

import Link from 'next/link';
import { useRef, useState, useEffect } from 'react';
import { LogOut, User, Settings } from 'lucide-react';

export function PortalUserMenu({
  displayName,
  email,
}: {
  displayName: string | null;
  email: string | null;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const initials = (displayName ?? email ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md p-1.5 hover:bg-[var(--color-muted)]"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-[var(--color-primary-foreground)]">
          {initials || <User className="size-4" aria-hidden />}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] shadow-lg"
        >
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <p className="truncate text-sm font-medium">{displayName ?? 'Bewohner'}</p>
            {email && (
              <p className="truncate text-xs text-[var(--color-muted-foreground)]">{email}</p>
            )}
          </div>
          <Link
            href="/portal/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-[var(--color-muted)]"
          >
            <Settings className="size-4" aria-hidden />
            Konto
          </Link>
          <form action="/portal/logout" method="POST" className="border-t border-[var(--color-border)]">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-[var(--color-muted)]"
            >
              <LogOut className="size-4" aria-hidden />
              Abmelden
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
