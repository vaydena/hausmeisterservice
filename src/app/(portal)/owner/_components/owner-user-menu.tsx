'use client';

import { useRef, useState, useEffect } from 'react';
import { LogOut, User } from 'lucide-react';
import { formatUserRoleLabel } from '@/lib/permissions/user-role-label';

export function OwnerUserMenu({
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
            <p className="truncate text-sm font-medium">{displayName ?? 'Eigentümer'}</p>
            {email && (
              <p className="truncate text-xs text-[var(--color-muted-foreground)]">{email}</p>
            )}
            {/*
              Nutzerklasse ausdruecklich benannt (Muster aus dem Bewohnerportal):
              statisch, nicht aus einer Rolle abgeleitet — der Portalzugang
              haengt an owners.user_id, nicht an user_roles.
            */}
            <p className="mt-1 text-xs font-medium text-[var(--color-primary)]">
              {formatUserRoleLabel({ userClass: 'owner' })}
            </p>
          </div>
          <form action="/owner/logout" method="POST">
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
