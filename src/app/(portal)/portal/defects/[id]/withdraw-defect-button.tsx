'use client';

import { useTransition, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { withdrawPortalDefectAction } from '../actions';

interface WithdrawDefectButtonProps {
  defectId: string;
  code: string | null;
}

export function WithdrawDefectButton({ defectId, code }: WithdrawDefectButtonProps) {
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const label = code ? `Meldung ${code}` : 'diese Meldung';
    if (
      !confirm(
        `${label} zurückziehen? Sie kann nach dem Zurückziehen nicht wiederhergestellt werden. Falls Sie später wieder eine Meldung erstellen möchten, geht das über "Neue Meldung".`,
      )
    ) {
      return;
    }
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await withdrawPortalDefectAction(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="id" value={defectId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-muted-foreground)] transition hover:border-[var(--color-destructive)] hover:text-[var(--color-destructive)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <X className="h-4 w-4" aria-hidden />
        {pending ? 'Wird zurückgezogen…' : 'Meldung zurückziehen'}
      </button>
    </form>
  );
}
