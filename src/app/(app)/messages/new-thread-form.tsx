'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { MessagingFormState } from './actions';

const INITIAL: MessagingFormState = {};

type UserOption = { id: string; display_name: string | null };

export function NewThreadForm({
  action,
  cancelHref,
  users,
  currentUserId,
}: {
  action: (prev: MessagingFormState, form: FormData) => Promise<MessagingFormState>;
  cancelHref: string;
  users: UserOption[];
  currentUserId: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const err = state.fieldErrors ?? {};
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const options = users.filter((u) => u.id !== currentUserId);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="participant_ids" value={id} />
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Empfänger</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-3">
            {err['participant_ids'] && (
              <p role="alert" className="text-sm text-[var(--color-destructive)]">
                {err['participant_ids']}
              </p>
            )}
            {options.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Keine weiteren Nutzer im Tenant.
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {options.map((u) => {
                  const isOn = selected.has(u.id);
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => toggle(u.id)}
                        className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition ${
                          isOn
                            ? 'border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]'
                            : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                            isOn
                              ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                              : 'border-[var(--color-border)]'
                          }`}
                        >
                          {isOn ? '✓' : ''}
                        </span>
                        <span className="truncate">
                          {u.display_name ?? u.id.slice(0, 8)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {selected.size} Empfänger ausgewählt · Sie werden automatisch als Absender hinzugefügt.
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nachricht</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <Field label="Betreff" htmlFor="subject" error={err['subject']}>
              <Input
                id="subject"
                name="subject"
                required
                autoFocus
                placeholder="Worum geht es?"
              />
            </Field>
            <Field label="Nachricht" htmlFor="body" error={err['body']}>
              <Textarea
                id="body"
                name="body"
                required
                rows={5}
                placeholder="Ihre Nachricht …"
              />
            </Field>
          </div>
        </CardBody>
        <CardFooter>
          {state.error && (
            <p role="alert" className="mr-auto text-sm text-[var(--color-destructive)]">
              {state.error}
            </p>
          )}
          <Link
            href={cancelHref}
            className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            Abbrechen
          </Link>
          <Button type="submit" disabled={pending || selected.size === 0}>
            {pending ? 'Sende …' : 'Senden'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
