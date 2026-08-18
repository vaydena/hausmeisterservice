'use client';

import { withdrawOwnerDefectAction } from '../actions';

export function WithdrawDefectButton({ id }: { id: string }) {
  return (
    <form action={withdrawOwnerDefectAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
      >
        Meldung zurückziehen
      </button>
    </form>
  );
}
