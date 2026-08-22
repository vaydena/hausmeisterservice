'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import {
  isStaleDeployError,
  canSelfHealNow,
  performStaleDeployReload,
} from '@/lib/errors/stale-deploy';

// Fehler-Boundary fuer alle Routen unterhalb des RootLayouts. Faengt sowohl
// serverseitige Render-Fehler (via Next-Fehlerprotokoll + digest) als auch
// clientseitige Exceptions ab. RootLayout + globals.css sind hier bereits
// geladen; im schlimmeren Fall (RootLayout selbst crasht) uebernimmt
// global-error.tsx.
export default function AppErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Ein "veralteter Build"-Fehler (alte Chunks/Action-IDs nach einem Deploy)
  // ist kein Seiten-Bug, sondern Cache-Versatz — er heilt durch einmaliges
  // Neuladen. Entscheidung EINMAL beim Mount treffen (rein lesend): stale UND
  // Schleifenschutz erlaubt ein Reload? Greift der Schutz oder ist es ein
  // echter Fehler, bleibt selfHealing false und wir zeigen die normale Meldung.
  const [selfHealing] = useState(
    () => isStaleDeployError(error) && canSelfHealNow(),
  );

  useEffect(() => {
    // Sentry ist nur aktiv, wenn DSN gesetzt ist; Aufruf ist ansonsten
    // ein billiger No-Op.
    Sentry.captureException(error);
  }, [error]);

  useEffect(() => {
    // Das eigentliche Neuladen ist ein Seiten-Effekt (window/location) — hier
    // richtig aufgehoben, ohne setState.
    if (selfHealing) performStaleDeployReload();
  }, [selfHealing]);

  if (selfHealing) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Seite wird aktualisiert …
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12 text-center">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-destructive)]">
          Fehler
        </p>
        <h1 className="text-2xl font-semibold text-[var(--color-foreground)]">
          Etwas ist schiefgelaufen
        </h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Beim Aufruf dieser Seite ist ein unerwarteter Fehler aufgetreten.
          Wir wurden automatisch informiert.
        </p>
        {error.digest ? (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Referenz-ID fuer den Support: <code>{error.digest}</code>
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex w-full items-center justify-center rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
        >
          Erneut versuchen
        </button>
        <Link
          href="/"
          className="inline-flex w-full items-center justify-center rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
        >
          Zur Startseite
        </Link>
      </div>
      <p className="text-xs text-[var(--color-muted-foreground)]">
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
