'use client';

import { useActionState } from 'react';
import { inviteResidentToPortalAction, revokePortalAccessAction, type InvitePortalState } from '../actions';

const INITIAL: InvitePortalState = {};

export function PortalInviteButton({
  residentId,
  disabled,
}: {
  residentId: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(inviteResidentToPortalAction, INITIAL);

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction}>
        <input type="hidden" name="resident_id" value={residentId} />
        <button
          type="submit"
          disabled={pending || disabled}
          className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Einladung wird versendet …' : 'Portal-Zugang einladen'}
        </button>
      </form>
      {state.error && (
        <p role="alert" className="text-xs text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">
          {state.success}
        </p>
      )}
    </div>
  );
}

export function PortalRevokeButton({ residentId }: { residentId: string }) {
  return (
    <form action={revokePortalAccessAction}>
      <input type="hidden" name="resident_id" value={residentId} />
      <button
        type="submit"
        className="inline-flex h-8 items-center rounded-md border border-[var(--color-border)] px-3 text-xs font-medium hover:bg-[var(--color-muted)]"
      >
        Portal-Zugang entkoppeln
      </button>
    </form>
  );
}
