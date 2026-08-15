'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { CharCounter } from '@/components/ui/char-counter';
import { postPortalMessageAction, type PortalMessageFormState } from '../actions';

const INITIAL: PortalMessageFormState = {};

// Server-Limit aus portal/messages/actions.ts (postSchema). Sprint 97: bis
// hierher fehlte das maxLength komplett — eine lange Antwort lief in einen
// Zod-Fehler beim Absenden, statt beim Tippen gebremst zu werden.
const BODY_MAX = 4000;

export function PortalReplyForm({
  threadId,
  hasRecipients,
}: {
  threadId: string;
  hasRecipients: boolean;
}) {
  const [state, formAction, pending] = useActionState(postPortalMessageAction, INITIAL);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [bodyLength, setBodyLength] = useState(0);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
      // Der Zaehler haengt am React-State, form.reset() leert nur das DOM —
      // ohne das hier bliebe nach dem Senden die alte Laenge stehen.
      setBodyLength(0);
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
        maxLength={BODY_MAX}
        disabled={disabled}
        placeholder={disabled ? 'Antworten derzeit nicht möglich' : 'Ihre Antwort …'}
        onChange={(e) => setBodyLength(e.target.value.length)}
        aria-describedby="reply-body-counter"
        className="resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:bg-[var(--color-muted)] disabled:opacity-70"
      />
      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        {!disabled && bodyLength > 0 && (
          <CharCounter id="reply-body-counter" length={bodyLength} max={BODY_MAX} />
        )}
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
