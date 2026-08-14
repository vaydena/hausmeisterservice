'use client';

import { useActionState } from 'react';
import { changePortalEmailAction, type PortalAccountActionState } from './actions';

const INITIAL: PortalAccountActionState = {};

/**
 * Sprint 38: Portal-Variante des Staff-ChangeEmailForm. Semantisch
 * identisch, mit angepasstem Wording ("Bewohner-Portal-Konto" statt
 * generisch). Duplikat statt Abstraktion, damit sich die Copy fuer
 * Bewohner unabhaengig weiterentwickeln kann.
 */
export function ChangePortalEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction, pending] = useActionState(
    changePortalEmailAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-3 py-2 text-sm">
        <span className="text-[var(--color-muted-foreground)]">Aktuelle E-Mail: </span>
        <span className="font-medium">{currentEmail}</span>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Neue E-Mail-Adresse</span>
        <input
          type="email"
          name="newEmail"
          required
          maxLength={254}
          autoComplete="email"
          placeholder="neue@adresse.de"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
        <span className="text-xs text-[var(--color-muted-foreground)]">
          Sie erhalten einen Bestaetigungs-Link an die neue Adresse. Der Wechsel
          wird erst nach Klick auf den Link wirksam — bis dahin melden Sie sich
          weiterhin mit Ihrer aktuellen E-Mail an.
        </span>
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          className="rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/5 p-3 text-sm text-[var(--color-success)]"
        >
          {state.success}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Sende Bestaetigungs-Mail …' : 'E-Mail-Adresse aendern'}
        </button>
      </div>
    </form>
  );
}
