import type { ReactNode } from 'react';
import Link from 'next/link';
import { legalConfig } from '@/lib/legal/config';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-muted)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/login"
            className="flex items-center gap-2 text-sm font-medium text-[var(--color-foreground)] hover:underline"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-xs font-semibold">
              HS
            </span>
            {legalConfig.productName}
          </Link>
          <nav className="flex gap-4 text-sm text-[var(--color-muted-foreground)]">
            <Link href="/impressum" className="hover:text-[var(--color-foreground)] hover:underline">
              Impressum
            </Link>
            <Link href="/datenschutz" className="hover:text-[var(--color-foreground)] hover:underline">
              Datenschutz
            </Link>
            <Link href="/agb" className="hover:text-[var(--color-foreground)] hover:underline">
              AGB
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 px-4 py-10 sm:px-6">
        <article className="mx-auto max-w-3xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm sm:p-10">
          {children}
          <p className="mt-10 border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-muted-foreground)]">
            Stand: {legalConfig.lastUpdated}
          </p>
        </article>
      </main>
      <footer className="border-t border-[var(--color-border)] bg-[var(--color-background)] px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 text-xs text-[var(--color-muted-foreground)] sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} {legalConfig.company.name}</span>
          <nav className="flex gap-4">
            <Link href="/impressum" className="hover:underline">Impressum</Link>
            <Link href="/datenschutz" className="hover:underline">Datenschutz</Link>
            <Link href="/agb" className="hover:underline">AGB</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
