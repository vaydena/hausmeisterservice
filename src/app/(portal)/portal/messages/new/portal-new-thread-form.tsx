'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { createPortalThreadAction, type PortalCreateThreadFormState } from '../actions';

const INITIAL: PortalCreateThreadFormState = {};

// Sprint 96: Server-Limit ist 4000 (portal/messages/actions.ts). Das textarea
// hat schon maxLength=4000, aber ohne sichtbaren Counter tippt Bewohner blind
// gegen das Limit — bei einem laengeren Anliegen (Nachbarschaftsstreit, formale
// Beschwerde) faellt der Text still weg. Warn-Schwelle bei 90%, Hard-Warn bei
// 97.5% — letzterer bekommt destructive-Rot, damit klar wird "gleich reicht's".
const BODY_MAX = 4000;
const BODY_WARN = Math.floor(BODY_MAX * 0.9);
const BODY_HARD_WARN = Math.floor(BODY_MAX * 0.975);

export function PortalNewThreadForm() {
  const [state, formAction, pending] = useActionState(createPortalThreadAction, INITIAL);
  const err = state.fieldErrors ?? {};
  const [bodyLength, setBodyLength] = useState(0);
  const bodyCounterClass =
    bodyLength >= BODY_HARD_WARN
      ? 'text-[var(--color-destructive)]'
      : bodyLength >= BODY_WARN
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-[var(--color-muted-foreground)]';

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="subject" className="text-sm font-medium">
          Betreff
        </label>
        <input
          id="subject"
          name="subject"
          type="text"
          required
          autoFocus
          maxLength={200}
          placeholder="Worum geht es?"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
        {err.subject && (
          <p role="alert" className="text-xs text-[var(--color-destructive)]">
            {err.subject}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="body" className="text-sm font-medium">
          Nachricht
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={6}
          maxLength={BODY_MAX}
          placeholder="Ihre Nachricht an die Hausverwaltung …"
          onChange={(e) => setBodyLength(e.target.value.length)}
          aria-describedby="body-counter"
          className="resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
        <div className="flex items-center justify-between gap-2">
          {err.body ? (
            <p role="alert" className="text-xs text-[var(--color-destructive)]">
              {err.body}
            </p>
          ) : (
            <span aria-hidden />
          )}
          <p id="body-counter" className={`text-xs tabular-nums ${bodyCounterClass}`}>
            {bodyLength} / {BODY_MAX} Zeichen
          </p>
        </div>
      </div>

      {state.error && !state.fieldErrors && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href="/portal/messages"
          className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
        >
          Abbrechen
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Senden …' : 'Nachricht senden'}
        </button>
      </div>
    </form>
  );
}
