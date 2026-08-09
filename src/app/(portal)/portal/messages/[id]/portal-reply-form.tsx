'use client';

import { useActionState, useEffect, useRef } from 'react';
import { postPortalMessageAction, type PortalMessageFormState } from '../actions';

const INITIAL: PortalMessageFormState = {};

export function PortalReplyForm({ threadId }: { threadId: string }) {
  const [state, formAction, pending] = useActionState(postPortalMessageAction, INITIAL);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="thread_id" value={threadId} />
      <textarea
        name="body"
        required
        rows={3}
        placeholder="Ihre Antwort …"
        className="resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
      />
      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Senden …' : 'Senden'}
        </button>
      </div>
    </form>
  );
}
