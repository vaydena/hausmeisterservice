import type { ReactNode } from 'react';
import Link from 'next/link';
import { getResidentContext } from '@/lib/portal/current';
import { clientEnv } from '@/lib/env';
import { PortalUserMenu } from './_components/portal-user-menu';
import { PortalNav } from './_components/portal-nav';

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const ctx = await getResidentContext();

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-muted)]">
      <header className="flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-background)] px-4 md:px-6">
        <Link href={ctx ? '/portal/dashboard' : '/portal/login'} className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-xs font-semibold">
            HS
          </span>
          <span>{clientEnv.NEXT_PUBLIC_APP_NAME} — Bewohner-Portal</span>
        </Link>
        {ctx && (
          <PortalUserMenu displayName={ctx.displayName} email={ctx.email} />
        )}
      </header>

      {ctx && (
        <nav className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
          <div className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 py-2 md:px-6">
            <PortalNav />
          </div>
        </nav>
      )}

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">{children}</div>
      </main>

      <footer className="border-t border-[var(--color-border)] bg-[var(--color-background)] px-4 py-4 text-center text-xs text-[var(--color-muted-foreground)] md:px-6">
        {ctx?.propertyName && (
          <div className="mb-1">
            Sie sind angemeldet als Bewohner von {ctx.propertyName}
            {ctx.unitCode ? `, Einheit ${ctx.unitCode}` : ''}.
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span>© {new Date().getFullYear()} {clientEnv.NEXT_PUBLIC_APP_NAME}</span>
          <Link href="/impressum" className="hover:text-[var(--color-foreground)] hover:underline">
            Impressum
          </Link>
          <Link href="/datenschutz" className="hover:text-[var(--color-foreground)] hover:underline">
            Datenschutz
          </Link>
          <Link href="/agb" className="hover:text-[var(--color-foreground)] hover:underline">
            AGB
          </Link>
        </div>
      </footer>
    </div>
  );
}
