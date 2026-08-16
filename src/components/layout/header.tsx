import { Suspense } from 'react';
import { Bell } from 'lucide-react';
import { UserMenu } from './user-menu';
import { NotificationBell } from './notification-bell';

export function Header({
  displayName,
  email,
  tenantName,
  roleLabel,
  isPlatformAdmin = false,
}: {
  displayName: string | null;
  email: string | null;
  /** Firmenname des Mandanten. Optional, weil der Plattform-Bereich keinen hat. */
  tenantName?: string;
  roleLabel: string;
  isPlatformAdmin?: boolean;
}) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-background)] px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Menü"
          className="rounded-md p-2 hover:bg-[var(--color-muted)] md:hidden"
        >
          <span aria-hidden className="block h-0.5 w-5 bg-[var(--color-foreground)]" />
          <span aria-hidden className="mt-1 block h-0.5 w-5 bg-[var(--color-foreground)]" />
          <span aria-hidden className="mt-1 block h-0.5 w-5 bg-[var(--color-foreground)]" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <Suspense
          fallback={
            <button
              type="button"
              aria-label="Benachrichtigungen"
              className="relative rounded-md p-2 hover:bg-[var(--color-muted)]"
              disabled
            >
              <Bell className="size-4" aria-hidden />
            </button>
          }
        >
          <NotificationBell />
        </Suspense>
        <UserMenu
          displayName={displayName}
          email={email}
          tenantName={tenantName}
          roleLabel={roleLabel}
          isPlatformAdmin={isPlatformAdmin}
        />
      </div>
    </header>
  );
}
