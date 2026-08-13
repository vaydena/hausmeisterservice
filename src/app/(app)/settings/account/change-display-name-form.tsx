'use client';

import { useActionState } from 'react';
import { changeDisplayNameAction, type AccountActionState } from './actions';

const INITIAL: AccountActionState = {};

export function ChangeDisplayNameForm({ currentDisplayName }: { currentDisplayName: string }) {
  const [state, formAction, pending] = useActionState(changeDisplayNameAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Anzeigename</span>
        <input
          type="text"
          name="displayName"
          required
          minLength={2}
          maxLength={60}
          autoComplete="name"
          defaultValue={currentDisplayName}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
        <span className="text-xs text-[var(--color-muted-foreground)]">
          Wird oben rechts, in Nachrichten und in Audit-Log-Eintraegen angezeigt.
        </span>
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
          {pending ? 'Speichere …' : 'Anzeigename speichern'}
        </button>
      </div>
    </form>
  );
}
