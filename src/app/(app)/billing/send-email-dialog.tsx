'use client';

import { useActionState, useEffect, useRef } from 'react';
import { sendBillingEmailAction, type SendBillingEmailState } from './email-actions';

interface Props {
  kind: 'invoice' | 'offer';
  id: string;
  code: string;
  title: string;
  defaultTo?: string;
}

const INITIAL: SendBillingEmailState = { ok: false, message: null, fieldErrors: {} };

export function SendBillingEmailButton(props: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [state, formAction, pending] = useActionState(sendBillingEmailAction, INITIAL);

  useEffect(() => {
    if (state.ok && dialogRef.current?.open) {
      dialogRef.current.close();
    }
  }, [state.ok, state]);

  const label = props.kind === 'invoice' ? 'Rechnung' : 'Angebot';
  const defaultMessage =
    props.kind === 'invoice'
      ? `anbei senden wir Ihnen unsere Rechnung ${props.code}.\n\nBitte überweisen Sie den Betrag bis zum angegebenen Zahlungsziel auf das im Anhang genannte Konto.\n\nBei Rückfragen sind wir gern für Sie da.`
      : `anbei senden wir Ihnen unser Angebot ${props.code}.\n\nWir freuen uns auf Ihre Rückmeldung. Bei Fragen zu Positionen oder Preisen sind wir gern für Sie da.`;

  const defaultSubject = `${label} ${props.code} — ${props.title}`;

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
      >
        Per E-Mail senden
      </button>

      <dialog
        ref={dialogRef}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-0 shadow-xl backdrop:bg-black/40"
        onClose={() => {
          /* no-op, native close */
        }}
      >
        <form
          action={formAction}
          className="flex w-[min(560px,calc(100vw-32px))] flex-col gap-4 p-5 text-sm text-[var(--color-foreground)]"
        >
          <input type="hidden" name="kind" value={props.kind} />
          <input type="hidden" name="id" value={props.id} />

          <header className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">{label} per E-Mail senden</h2>
              <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                {props.code} — {props.title}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-md p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
              aria-label="Schließen"
            >
              ×
            </button>
          </header>

          <Field
            label="An (E-Mail, mehrere durch Komma trennen)"
            name="to"
            defaultValue={props.defaultTo ?? ''}
            error={state.fieldErrors['to']}
            required
          />
          <Field
            label="CC (optional)"
            name="cc"
            defaultValue=""
            error={state.fieldErrors['cc']}
          />
          <Field
            label="Betreff"
            name="subject"
            defaultValue={defaultSubject}
            error={state.fieldErrors['subject']}
          />

          <div>
            <label htmlFor="send-email-message" className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
              Nachricht
            </label>
            <textarea
              id="send-email-message"
              name="message"
              defaultValue={defaultMessage}
              rows={7}
              required
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
            {state.fieldErrors['message'] && (
              <p className="mt-1 text-xs text-[var(--color-destructive)]">{state.fieldErrors['message']}</p>
            )}
          </div>

          <p className="rounded-md bg-[var(--color-muted)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
            Die {label.toLowerCase()} wird als PDF automatisch angehängt.
          </p>

          {state.message && !state.ok && (
            <p className="text-xs text-[var(--color-destructive)]" role="alert">
              {state.message}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-3">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Wird gesendet…' : 'Senden'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function Field({
  label,
  name,
  defaultValue,
  error,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]" htmlFor={`send-email-${name}`}>
        {label}
      </label>
      <input
        id={`send-email-${name}`}
        name={name}
        type="text"
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
      />
      {error && <p className="mt-1 text-xs text-[var(--color-destructive)]">{error}</p>}
    </div>
  );
}
