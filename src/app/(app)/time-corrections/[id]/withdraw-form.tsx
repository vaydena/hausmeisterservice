'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { withdrawCorrectionAction } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? 'Ziehe zurück…' : 'Antrag zurückziehen'}
    </Button>
  );
}

export function WithdrawForm({ correctionId }: { correctionId: string }) {
  const [error, setError] = useState<string | null>(null);

  async function handle(formData: FormData) {
    setError(null);
    try {
      await withdrawCorrectionAction(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aktion fehlgeschlagen.');
    }
  }

  return (
    <div>
      <form action={handle}>
        <input type="hidden" name="correction_id" value={correctionId} />
        <SubmitButton />
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-[var(--color-destructive)]">
          {error}
        </p>
      )}
    </div>
  );
}
