'use client';

import { useActionState } from 'react';
import {
  generatePortalMfaRecoveryCodesAction,
  type PortalRecoveryCodesState,
} from './actions';

const INITIAL: PortalRecoveryCodesState = {};

/**
 * Sprint 35: Portal-Variante der Recovery-Codes-Sektion. Identisch zur
 * Staff-Komponente in RecoveryCodesForm, gegated auf die Portal-Action.
 * Duplikat statt Abstraktion, damit Portal- und Staff-Texte unabhaengig
 * bleiben koennen (z.B. Anrede "Sie" gegenueber "Sie" — heute gleich,
 * kann sich aendern).
 */
export function PortalRecoveryCodesForm({ unusedCount }: { unusedCount: number }) {
  const [state, formAction, pending] = useActionState(
    generatePortalMfaRecoveryCodesAction,
    INITIAL,
  );

  const freshCodes = state.codes ?? null;
  const hasCodes = unusedCount > 0 || freshCodes !== null;
  const lowOnCodes = unusedCount > 0 && unusedCount <= 2;

  function handleDownload() {
    if (!freshCodes) return;
    const now = new Date();
    const stamp = now.toISOString().slice(0, 10);
    const header = [
      'Bewohner-Portal — Recovery-Codes fuer die Zwei-Faktor-Authentifizierung',
      `Generiert am ${now.toLocaleString('de-DE')}`,
      '',
      'Jeder Code kann genau EINMAL verwendet werden. Bewahren Sie diese',
      'Datei sicher auf (Passwort-Manager, Tresor). Ohne diese Codes und',
      'ohne Ihr Authenticator-Geraet muessen Sie die Verwaltung kontaktieren,',
      'um wieder Zugang zu erhalten.',
      '',
      '---',
      '',
    ].join('\n');
    const body = freshCodes.join('\n');
    const blob = new Blob([`${header}${body}\n`], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bewohner-portal-recovery-codes-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleCopy() {
    if (!freshCodes) return;
    try {
      await navigator.clipboard.writeText(freshCodes.join('\n'));
    } catch {
      // Silent fail — Clipboard-API kann in unsicheren Kontexten (kein
      // HTTPS) fehlen; der Download-Button ist der zuverlaessige Fallback.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-sm">
          <span className="font-medium">{unusedCount}</span>{' '}
          <span className="text-[var(--color-muted-foreground)]">
            von 10 Recovery-Codes verfuegbar.
          </span>
        </p>
        {!hasCodes && (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            Empfohlen bei aktiver Zwei-Faktor-Authentifizierung.
          </span>
        )}
        {lowOnCodes && !freshCodes && (
          <span className="text-xs font-medium text-[var(--color-destructive)]">
            Nur noch wenige Codes uebrig — jetzt neu generieren.
          </span>
        )}
      </div>

      {freshCodes ? (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-4"
        >
          <p className="text-sm font-medium text-[var(--color-foreground)]">
            Ihre 10 neuen Recovery-Codes
          </p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            <strong className="text-[var(--color-destructive)]">Wichtig:</strong>{' '}
            Diese Codes werden Ihnen nur ein einziges Mal angezeigt. Speichern
            Sie sie jetzt in einem Passwort-Manager oder laden Sie die Textdatei
            herunter. Alte Codes aus fruehreren Batches sind ab sofort ungueltig.
          </p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-3">
            {freshCodes.map((code) => (
              <li
                key={code}
                className="rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-center tracking-widest"
              >
                {code}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--color-primary)] px-3 text-xs font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90"
            >
              Als Textdatei herunterladen
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--color-border)] px-3 text-xs font-medium transition hover:bg-[var(--color-muted)]/50"
            >
              In Zwischenablage kopieren
            </button>
          </div>
        </div>
      ) : null}

      {state.error && !freshCodes && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}

      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          onClick={(e) => {
            if (hasCodes) {
              const proceed = window.confirm(
                'Neue Recovery-Codes generieren? Alle bisherigen Codes werden dabei ungueltig.',
              );
              if (!proceed) e.preventDefault();
            }
          }}
          className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--color-border)] px-4 text-sm font-medium transition hover:bg-[var(--color-muted)]/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending
            ? 'Generiere …'
            : hasCodes
              ? 'Recovery-Codes neu generieren'
              : 'Recovery-Codes generieren'}
        </button>
      </form>
    </div>
  );
}
