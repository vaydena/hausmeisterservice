'use client';

import { useActionState, useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { postPortalMessageAction, type PortalMessageFormState } from '../actions';

const INITIAL: PortalMessageFormState = {};

export function PortalReplyForm({
  threadId,
  hasRecipients,
}: {
  threadId: string;
  hasRecipients: boolean;
}) {
  const [state, formAction, pending] = useActionState(postPortalMessageAction, INITIAL);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  const disabled = !hasRecipients;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="thread_id" value={threadId} />
      {disabled && (
        <div
          role="alert"
          className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Antworten sind derzeit nicht möglich, weil diesem Thread niemand
            aus der Hausverwaltung zugeordnet ist. Sobald jemand hinzugefügt
            wird, können Sie hier weiterschreiben.
          </p>
        </div>
      )}
      <textarea
        name="body"
        required
        rows={3}
        disabled={disabled}
        placeholder={disabled ? 'Antworten derzeit nicht möglich' : 'Ihre Antwort …'}
        className="resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:bg-[var(--color-muted)] disabled:opacity-70"
      />
      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || disabled}
          className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Senden …' : 'Senden'}
        </button>
      </div>
    </form>
  );
}
