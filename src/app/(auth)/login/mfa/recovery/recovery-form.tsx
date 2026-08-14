'use client';

import { useActionState } from 'react';
import { useMfaRecoveryCodeAction, type RecoveryLoginState } from './actions';

const INITIAL: RecoveryLoginState = {};

export function LoginMfaRecoveryForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(useMfaRecoveryCodeAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* next steuert das Post-Consume-Redirect-Ziel (Portal vs. Staff). */}
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Recovery-Code</span>
        <input
          type="text"
          name="code"
          required
          autoFocus
          autoComplete="off"
          placeholder="XXXX-XXXX"
          maxLength={20}
          className="w-56 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-center font-mono text-lg tracking-widest uppercase outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
        <span className="text-xs text-[var(--color-muted-foreground)]">
          Einer der 10 Codes, die Sie beim Einrichten der Zwei-Faktor-
          Authentifizierung gespeichert haben.
        </span>
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Pruefe …' : 'Code einloesen'}
        </button>
      </div>
    </form>
  );
}
