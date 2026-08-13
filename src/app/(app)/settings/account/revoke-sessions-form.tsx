'use client';

import { useActionState } from 'react';
import { signOutOtherSessionsAction, type AccountActionState } from './actions';

const INITIAL: AccountActionState = {};

export function RevokeSessionsForm() {
  const [state, formAction, pending] = useActionState(signOutOtherSessionsAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
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
          className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--color-border)] px-4 text-sm font-medium transition hover:bg-[var(--color-muted)]/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Melde ab …' : 'Alle anderen Sitzungen abmelden'}
        </button>
      </div>
    </form>
  );
}
