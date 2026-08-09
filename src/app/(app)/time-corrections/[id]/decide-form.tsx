'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { decideCorrectionAction } from '../actions';

function SubmitButton({
  label,
  variant,
  value,
  onClick,
}: {
  label: string;
  variant: 'primary' | 'destructive';
  value: 'approved' | 'rejected';
  onClick: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      name="status"
      value={value}
      disabled={pending}
      onClick={onClick}
    >
      {pending ? 'Wird verarbeitet…' : label}
    </Button>
  );
}

export function DecideForm({ correctionId }: { correctionId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState<'approved' | 'rejected' | null>(null);

  async function handle(formData: FormData) {
    setError(null);
    try {
      await decideCorrectionAction(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aktion fehlgeschlagen.');
    } finally {
      setInFlight(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entscheidung</CardTitle>
      </CardHeader>
      <form action={handle}>
        <input type="hidden" name="correction_id" value={correctionId} />
        <CardBody className="flex flex-col gap-3">
          <Field label="Kommentar (optional)" htmlFor="dc-note" optional>
            <Textarea
              id="dc-note"
              name="decision_note"
              rows={2}
              maxLength={2000}
              placeholder="Wird dem Antragsteller in der Notification angezeigt."
            />
          </Field>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Genehmigung übernimmt die vorgeschlagenen Werte automatisch in den Zeiteintrag.
          </p>
          {error && (
            <p role="alert" className="text-sm text-[var(--color-destructive)]">
              {error}
            </p>
          )}
          {inFlight && (
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {inFlight === 'approved' ? 'Genehmige…' : 'Lehne ab…'}
            </p>
          )}
        </CardBody>
        <CardFooter className="justify-end gap-2">
          <SubmitButton
            label="Ablehnen"
            variant="destructive"
            value="rejected"
            onClick={() => setInFlight('rejected')}
          />
          <SubmitButton
            label="Genehmigen"
            variant="primary"
            value="approved"
            onClick={() => setInFlight('approved')}
          />
        </CardFooter>
      </form>
    </Card>
  );
}
