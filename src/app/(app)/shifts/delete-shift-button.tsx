'use client';

import { useTransition, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { softDeleteShiftAction } from './actions';

export function DeleteShiftButton({ shiftId, name }: { shiftId: string; name: string }) {
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      !confirm(
        `Schicht „${name}" löschen? Sie verschwindet aus der Auswahl. Bereits geplante Einsätze behalten ihren Namen.`,
      )
    ) {
      return;
    }
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await softDeleteShiftAction(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="shift_id" value={shiftId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--color-border)] px-4 text-sm font-medium text-[var(--color-muted-foreground)] transition hover:border-[var(--color-destructive)] hover:text-[var(--color-destructive)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Trash2 className="size-4" aria-hidden />
        {pending ? 'Wird gelöscht …' : 'Schicht löschen'}
      </button>
    </form>
  );
}
