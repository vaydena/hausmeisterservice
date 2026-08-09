'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SCHEDULE_KINDS, SCHEDULE_KIND_LABEL, type ScheduleKind } from '@/lib/schemas/scheduling';

export interface EmployeeOption {
  id: string;
  label: string;
}

export interface EntryFormDefaults {
  employee_id: string;
  kind: ScheduleKind;
  title: string;
  note: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
}

export function EntryForm({
  action,
  mode,
  entryId,
  defaults,
  employees,
  onCancelHref,
}: {
  action: (formData: FormData) => Promise<void>;
  mode: 'create' | 'edit';
  entryId?: string;
  defaults: EntryFormDefaults;
  employees: readonly EmployeeOption[];
  onCancelHref: string;
}) {
  const [error, setError] = useState<string | null>(null);

  const submit = async (formData: FormData) => {
    setError(null);
    try {
      await action(formData);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Speichern fehlgeschlagen.';
      setError(msg);
    }
  };

  return (
    <form action={submit}>
      {entryId && <input type="hidden" name="entry_id" value={entryId} />}
      <Card>
        <CardHeader>
          <CardTitle>{mode === 'create' ? 'Neuer Termin' : 'Termin bearbeiten'}</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {error && (
            <div className="rounded-md border border-[var(--color-destructive)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] px-3 py-2 text-sm text-[var(--color-destructive)]">
              {error}
            </div>
          )}

          <Field label="Mitarbeiter" htmlFor="employee_id">
            <select
              id="employee_id"
              name="employee_id"
              defaultValue={defaults.employee_id}
              required
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            >
              <option value="">— wählen —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Art" htmlFor="kind">
            <select
              id="kind"
              name="kind"
              defaultValue={defaults.kind}
              required
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            >
              {SCHEDULE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {SCHEDULE_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Titel" htmlFor="title">
            <input
              id="title"
              name="title"
              defaultValue={defaults.title}
              required
              maxLength={200}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Beginn" htmlFor="start_at">
              <input
                id="start_at"
                name="start_at"
                type="datetime-local"
                defaultValue={defaults.start_at}
                required
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Ende" htmlFor="end_at">
              <input
                id="end_at"
                name="end_at"
                type="datetime-local"
                defaultValue={defaults.end_at}
                required
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="all_day"
              defaultChecked={defaults.all_day}
              className="size-4"
            />
            Ganztägig
          </label>

          <Field label="Notiz" htmlFor="note">
            <textarea
              id="note"
              name="note"
              defaultValue={defaults.note}
              maxLength={2000}
              rows={3}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
        </CardBody>
        <CardFooter className="justify-end gap-2">
          <Link href={onCancelHref}>
            <Button type="button" variant="secondary">
              Abbrechen
            </Button>
          </Link>
          <SubmitButton mode={mode} />
        </CardFooter>
      </Card>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function SubmitButton({ mode }: { mode: 'create' | 'edit' }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Speichert…' : mode === 'create' ? 'Termin anlegen' : 'Speichern'}
    </Button>
  );
}
