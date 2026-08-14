'use client';

import { useActionState } from 'react';
import { requestPortalPasswordResetAction, type PortalResetState } from './actions';

const INITIAL: PortalResetState = {};

/**
 * Sprint 39: Portal-Reset-Form. Semantisch identisch zum Staff-
 * Formular, aber ruft die Portal-Action, die den Rueckweg-Flag setzt.
 * Duplikat statt Abstraktion (Muster seit Sprint 33) — Copy fuer
 * Bewohner soll unabhaengig weiterentwickelt werden koennen.
 */
export function PortalResetForm() {
  const [state, formAction, pending] = useActionState(
    requestPortalPasswordResetAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">E-Mail</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          autoFocus
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}
      {state.info && (
        <p role="status" className="text-sm text-[var(--color-success)]">
          {state.info}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex h-10 items-center justify-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Sende …' : 'Link anfordern'}
      </button>
    </form>
  );
}
