'use client';

import { useActionState } from 'react';
import { requestOwnerPasswordResetAction, type OwnerResetState } from './actions';

const INITIAL: OwnerResetState = {};

/**
 * Eigentuemer-Reset-Form. Semantisch identisch zum Bewohner-/Staff-
 * Formular, ruft aber die Owner-Action, die den Rueckweg-Flag owner=1 setzt.
 * Duplikat statt Abstraktion (Repo-Muster) — Copy fuer Eigentuemer soll
 * unabhaengig weiterentwickelt werden koennen.
 */
export function OwnerResetForm() {
  const [state, formAction, pending] = useActionState(
    requestOwnerPasswordResetAction,
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
