import type { Metadata } from 'next';
import Link from 'next/link';
import { legalConfig } from '@/lib/legal/config';

export const metadata: Metadata = {
  title: 'Seite nicht gefunden',
  robots: { index: false, follow: false },
};

export default function NotFoundPage() {
  const productName = legalConfig.productName;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12 text-center">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          404
        </p>
        <h1 className="text-2xl font-semibold text-[var(--color-foreground)]">
          Seite nicht gefunden
        </h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Die aufgerufene Adresse existiert nicht (mehr) oder Sie haben
          keinen Zugriff darauf.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Link
          href="/"
          className="inline-flex w-full items-center justify-center rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
        >
          Zur Startseite
        </Link>
        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
        >
          Zum Login
        </Link>
      </div>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        {productName}
        {' · '}
        <Link href="/impressum" className="underline hover:opacity-80">
          Impressum
        </Link>
        {' · '}
        <Link href="/datenschutz" className="underline hover:opacity-80">
          Datenschutz
        </Link>
      </p>
    </main>
  );
}
