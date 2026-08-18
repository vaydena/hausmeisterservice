'use client';

import { useActionState } from 'react';
import {
  inviteOwnerToPortalAction,
  revokeOwnerPortalAccessAction,
  type InvitePortalState,
} from '../actions';

const INITIAL: InvitePortalState = {};

export function OwnerPortalInviteButton({
  ownerId,
  disabled,
}: {
  ownerId: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(inviteOwnerToPortalAction, INITIAL);

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction}>
        <input type="hidden" name="owner_id" value={ownerId} />
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

export function OwnerPortalRevokeButton({ ownerId }: { ownerId: string }) {
  return (
    <form action={revokeOwnerPortalAccessAction}>
      <input type="hidden" name="owner_id" value={ownerId} />
      <button
        type="submit"
        className="inline-flex h-8 items-center rounded-md border border-[var(--color-border)] px-3 text-xs font-medium hover:bg-[var(--color-muted)]"
      >
        Portal-Zugang entkoppeln
      </button>
    </form>
  );
}
