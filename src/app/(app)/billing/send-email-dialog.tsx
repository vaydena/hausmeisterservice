'use client';

import { useActionState, useEffect, useRef } from 'react';
import { sendBillingEmailAction, type SendBillingEmailState } from './email-actions';

interface Props {
  kind: 'invoice' | 'offer';
  id: string;
  code: string;
  title: string;
  defaultTo?: string;
  /**
   * Sprint 107: Mängel, die den Beleg unbrauchbar machen (fehlende
   * Steuernummer, Summe passt nicht zu den Positionen). Sie stehen hier
   * bewusst im Dialog und nicht nur auf der Seite darunter: hier ist der
   * Moment, in dem das Dokument das Haus verlässt.
   */
  defects?: string[];
}

const INITIAL: SendBillingEmailState = {
  ok: false,
  message: null,
  warning: null,
  fieldErrors: {},
};

export function SendBillingEmailButton(props: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [state, formAction, pending] = useActionState(sendBillingEmailAction, INITIAL);

  useEffect(() => {
    // Nur bei sauberem Erfolg schliessen. Gab es eine Warnung zur
    // Nachbuchung, bleibt der Dialog offen — sonst waere sie im selben
    // Moment weg, in dem sie entsteht.
    if (state.ok && !state.warning && dialogRef.current?.open) {
      dialogRef.current.close();
    }
  }, [state.ok, state.warning, state]);

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

          {props.defects && props.defects.length > 0 && (
            <div
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"
              role="status"
            >
              <p className="font-semibold">Diese Rechnung ist unvollständig</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {props.defects.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              <p className="mt-2 text-[var(--color-muted-foreground)]">
                Senden ist weiterhin möglich — der Empfänger wird die Rechnung aber
                voraussichtlich beanstanden.
              </p>
            </div>
          )}

          {state.message && !state.ok && (
            <p className="text-xs text-[var(--color-destructive)]" role="alert">
              {state.message}
            </p>
          )}

          {state.ok && state.warning && (
            <div
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"
              role="alert"
            >
              <p className="font-semibold">{state.message}</p>
              <p className="mt-1">{state.warning}</p>
            </div>
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
