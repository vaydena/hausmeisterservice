'use client';

import { useActionState, useState } from 'react';
import { verifyLoginMfaAction, type LoginMfaState } from './actions';

const INITIAL: LoginMfaState = {};

type Factor = { id: string; friendlyName: string | null };

export function LoginMfaVerifyForm({
  factors,
  next,
}: {
  factors: Factor[];
  next: string;
}) {
  const [state, formAction, pending] = useActionState(verifyLoginMfaAction, INITIAL);
  const [factorId, setFactorId] = useState(factors[0]?.id ?? '');

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      {factors.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Faktor auswaehlen</legend>
          {factors.map((f) => (
            <label
              key={f.id}
              className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            >
              <input
                type="radio"
                name="factorId"
                value={f.id}
                checked={factorId === f.id}
                onChange={() => setFactorId(f.id)}
              />
              <span>{f.friendlyName ?? 'Authenticator-App'}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <input type="hidden" name="factorId" value={factorId} />
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">6-stelliger Code</span>
        <input
          type="text"
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          autoFocus
          className="w-40 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-center font-mono text-lg tracking-widest outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending || !factorId}
          className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Pruefe …' : 'Anmelden'}
        </button>
      </div>
    </form>
  );
}
