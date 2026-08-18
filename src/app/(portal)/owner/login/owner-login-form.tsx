'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { ownerSignInAction, type OwnerLoginState } from './actions';

const INITIAL: OwnerLoginState = {};

export function OwnerLoginForm() {
  const [state, formAction, pending] = useActionState(ownerSignInAction, INITIAL);

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

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Passwort</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
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
        {pending ? 'Anmelden …' : 'Anmelden'}
      </button>

      <div className="flex justify-between text-sm">
        <Link
          href="/owner/reset-password"
          className="text-[var(--color-primary)] hover:underline"
        >
          Passwort vergessen?
        </Link>
        <Link href="/login" className="text-[var(--color-muted-foreground)] hover:underline">
          Mitarbeiter-Login
        </Link>
      </div>
    </form>
  );
}
