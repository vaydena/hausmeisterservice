'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, LogOut, Shield, User } from 'lucide-react';

export function UserMenu({
  displayName,
  email,
  tenantName,
  roleLabel,
  isPlatformAdmin = false,
}: {
  displayName: string | null;
  email: string | null;
  /** Sprint 123: Firmenname des Mandanten, in dem der User gerade arbeitet. */
  tenantName?: string;
  /** Sprint 122: z. B. "Inhaber · Administrator". Siehe formatUserRoleLabel. */
  roleLabel: string;
  /**
   * Sprint 123: Bis hierher gab es KEINEN Link auf /platform ausserhalb des
   * Plattform-Bereichs selbst — erreichbar war er nur durch Eintippen der
   * URL. Damit war der einzige Unterschied zwischen dem Betreiber und einem
   * beliebigen Kunden in der Oberflaeche unsichtbar, und der Betreiber
   * konnte zu Recht den Eindruck bekommen, sein Zugang sei derselbe wie der
   * eines frisch registrierten Interessenten.
   */
  isPlatformAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const initials = (displayName ?? email ?? '?')
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex size-8 items-center justify-center rounded-full bg-[var(--color-muted)] text-xs font-medium hover:bg-[var(--color-accent)]"
        aria-label="Benutzermenü"
      >
        {initials}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-50 w-56 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-1 shadow-md"
        >
          <div className="border-b border-[var(--color-border)] px-3 py-2">
            <div className="text-sm font-medium">{displayName ?? 'Unbenannt'}</div>
            {email && (
              <div className="truncate text-xs text-[var(--color-muted-foreground)]">{email}</div>
            )}
            {tenantName && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
                <Building2 className="size-3 shrink-0" aria-hidden />
                <span className="truncate font-medium text-[var(--color-foreground)]">
                  {tenantName}
                </span>
              </div>
            )}
            <div className="mt-0.5 text-xs font-medium text-[var(--color-primary)]">{roleLabel}</div>
          </div>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-[var(--color-muted)]"
            onClick={() => {
              window.location.href = '/settings/account';
            }}
          >
            <User className="size-4" aria-hidden />
            Konto & Einstellungen
          </button>
          {isPlatformAdmin && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-[var(--color-muted)]"
              onClick={() => {
                window.location.href = '/platform';
              }}
            >
              <Shield className="size-4" aria-hidden />
              Plattform-Verwaltung
            </button>
          )}
          <form action="/logout" method="post">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--color-destructive)] hover:bg-[var(--color-muted)]"
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
