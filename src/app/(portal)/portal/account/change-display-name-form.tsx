'use client';

import { useActionState } from 'react';
import { changePortalDisplayNameAction, type PortalAccountActionState } from './actions';

const INITIAL: PortalAccountActionState = {};

/**
 * Sprint 44: Portal-Variante des Staff-ChangeDisplayNameForm. Bewusst
 * dupliziert statt shared, weil (a) die Server-Action einen anderen
 * Guard nutzt (requireResidentContext statt requireTenantContext) und
 * (b) die Copy sich am Bewohner-Kontext orientiert (Vertragsname
 * bleibt bestehen).
 */
export function PortalChangeDisplayNameForm({
  currentPreferredDisplayName,
  contractName,
}: {
  currentPreferredDisplayName: string | null;
  contractName: string;
}) {
  const [state, formAction, pending] = useActionState(
    changePortalDisplayNameAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-3 py-2 text-sm">
        <span className="text-[var(--color-muted-foreground)]">Vertragsname: </span>
        <span className="font-medium">{contractName}</span>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          Wird von der Hausverwaltung gepflegt und laesst sich hier nicht aendern.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Angezeigter Name</span>
        <input
          type="text"
          name="displayName"
          required
          minLength={2}
          maxLength={60}
          autoComplete="name"
          defaultValue={currentPreferredDisplayName ?? contractName}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
        <span className="text-xs text-[var(--color-muted-foreground)]">
          Erscheint oben rechts im Menue und im Kopf dieser Seite. Der Vertragsname bleibt fuer
          Meldungen an die Verwaltung erhalten.
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
