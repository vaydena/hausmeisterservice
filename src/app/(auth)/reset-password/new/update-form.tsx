'use client';

import { useActionState } from 'react';
import { updatePasswordAfterResetAction, type UpdateState } from './actions';

const INITIAL: UpdateState = {};

/**
 * Sprint 39: Portal-Flag entscheidet Redirect-Ziel nach erfolgreichem
 * Update — als hidden Input mitgeschickt, damit die Server-Action ihn
 * ohne Query-String-Parsing lesen kann.
 */
export function UpdatePasswordForm({
  isPortal = false,
  isOwner = false,
}: {
  isPortal?: boolean;
  isOwner?: boolean;
}) {
  const [state, formAction, pending] = useActionState(updatePasswordAfterResetAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {isPortal && <input type="hidden" name="portal" value="1" />}
      {isOwner && <input type="hidden" name="owner" value="1" />}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Neues Passwort</span>
        <input
          type="password"
          name="password"
          required
          minLength={10}
          maxLength={128}
          autoComplete="new-password"
          autoFocus
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
        <span className="text-xs text-[var(--color-muted-foreground)]">
          Mindestens 10 Zeichen.
        </span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Passwort bestätigen</span>
        <input
          type="password"
          name="passwordConfirm"
          required
          minLength={10}
          maxLength={128}
          autoComplete="new-password"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex h-10 items-center justify-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Speichere …' : 'Neues Passwort speichern'}
      </button>
    </form>
  );
}
