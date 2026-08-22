'use client';

import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import {
  isStaleDeployError,
  canSelfHealNow,
  performStaleDeployReload,
} from '@/lib/errors/stale-deploy';

// Fallback fuer den Fall, dass selbst das RootLayout crasht. Muss ein
// eigenes <html>/<body> mitbringen, weil das Layout nicht verfuegbar ist.
// Nur Inline-Styles verwenden — globals.css koennte hier fehlen.
export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Wie in error.tsx: veraltete Chunks nach einem Deploy heilen durch ein
  // einmaliges Neuladen, statt dem Nutzer den "Kritischer Fehler"-Schirm zu
  // zeigen. Entscheidung einmal beim Mount, Neuladen im Effekt. Schleifenschutz
  // in stale-deploy.ts.
  const [selfHealing] = useState(
    () => isStaleDeployError(error) && canSelfHealNow(),
  );

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  useEffect(() => {
    if (selfHealing) performStaleDeployReload();
  }, [selfHealing]);

  if (selfHealing) {
    return (
      <html lang="de">
        <body
          style={{
            margin: 0,
            minHeight: '100dvh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            fontFamily:
              'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            color: '#475569',
            background: '#f8fafc',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.875rem' }}>Seite wird aktualisiert …</p>
        </body>
      </html>
    );
  }

  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          color: '#0b1220',
          background: '#f8fafc',
        }}
      >
        <main
          style={{
            maxWidth: '28rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p
              style={{
                margin: 0,
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#b91c1c',
              }}
            >
              Kritischer Fehler
            </p>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>
              Die Anwendung konnte nicht geladen werden
            </h1>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#475569' }}>
              Ein unerwarteter Fehler hat die Anwendung gestoppt. Bitte laden
              Sie die Seite erneut. Wir wurden automatisch informiert.
            </p>
            {error.digest ? (
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#475569' }}>
                Referenz-ID fuer den Support:{' '}
                <code style={{ fontFamily: 'ui-monospace, monospace' }}>
                  {error.digest}
                </code>
              </p>
            ) : null}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                width: '100%',
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#ffffff',
                background: '#0f172a',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Neu laden
            </button>
            {/*
              Sprint 132 · Hier steht bewusst ein <a> und kein <Link>.
              global-error.tsx ersetzt das Root-Layout, wenn genau dieses
              kaputt ist — der Router-Kontext, auf dem next/link aufsetzt,
              ist in diesem Moment nicht verlaesslich. Eine harte Navigation
              ist der Sinn der Sache: sie laedt die Anwendung neu, statt zu
              versuchen, aus dem defekten Zustand heraus weiterzuklicken.
            */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                width: '100%',
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#0f172a',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                textDecoration: 'none',
                boxSizing: 'border-box',
              }}
            >
              Zur Startseite
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
