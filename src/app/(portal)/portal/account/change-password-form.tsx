'use client';

import { useActionState, useEffect, useRef } from 'react';
import { changePortalPasswordAction, type PortalAccountActionState } from './actions';

const INITIAL: PortalAccountActionState = {};

/**
 * Sprint 33: Portal-Variante des Staff-ChangePasswordForm. Identische
 * Felder (aktuelles + neues + neues bestaetigen) und identische UX;
 * gegated auf die Portal-Server-Action.
 */
export function ChangePortalPasswordForm() {
  const [state, formAction, pending] = useActionState(changePortalPasswordAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Aktuelles Passwort</span>
        <input
          type="password"
          name="currentPassword"
          required
          autoComplete="current-password"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Neues Passwort</span>
        <input
          type="password"
          name="newPassword"
          required
          minLength={10}
          maxLength={128}
          autoComplete="new-password"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
        <span className="text-xs text-[var(--color-muted-foreground)]">Mindestens 10 Zeichen.</span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Neues Passwort bestaetigen</span>
        <input
          type="password"
          name="newPasswordConfirm"
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
      {state.success && (
        <p role="status" className="text-sm text-[var(--color-success)]">
          {state.success}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Speichere …' : 'Passwort aendern'}
        </button>
      </div>
    </form>
  );
}
