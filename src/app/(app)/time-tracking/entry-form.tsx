'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button, LinkButton } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Card, CardBody, CardFooter } from '@/components/ui/card';
import {
  ENTRY_KINDS,
  ENTRY_KIND_LABEL,
  type TimeEntryKind,
} from '@/lib/schemas/time-tracking';

type Option = { id: string; label: string };

export type EntryFormDefaults = {
  kind: TimeEntryKind;
  start_at: string;
  end_at: string;
  work_order_id: string;
  property_id: string;
  note: string;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Speichern…' : label}
    </Button>
  );
}

export function EntryForm({
  action,
  mode,
  entryId,
  defaults,
  workOrders,
  properties,
  onCancelHref,
  requireEnd = true,
}: {
  action: (formData: FormData) => Promise<void>;
  mode: 'create' | 'edit';
  entryId?: string;
  defaults: EntryFormDefaults;
  workOrders: Option[];
  properties: Option[];
  onCancelHref: string;
  requireEnd?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  async function handleAction(formData: FormData) {
    setError(null);
    try {
      await action(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    }
  }

  return (
    <Card>
      <form action={handleAction}>
        <CardBody className="flex flex-col gap-4">
          {entryId && <input type="hidden" name="entry_id" value={entryId} />}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Art" htmlFor="ef-kind">
              <Select id="ef-kind" name="kind" defaultValue={defaults.kind}>
                {ENTRY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ENTRY_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <div />
            <Field label="Start" htmlFor="ef-start">
              <Input
                id="ef-start"
                name="start_at"
                type="datetime-local"
                defaultValue={defaults.start_at}
                required
              />
            </Field>
            <Field label="Ende" htmlFor="ef-end" optional={!requireEnd}>
              <Input
                id="ef-end"
                name="end_at"
                type="datetime-local"
                defaultValue={defaults.end_at}
                required={requireEnd}
              />
            </Field>
            <Field label="Objekt" htmlFor="ef-property" optional>
              <Select id="ef-property" name="property_id" defaultValue={defaults.property_id}>
                <option value="">— kein Objektbezug —</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Auftrag" htmlFor="ef-wo" optional>
              <Select id="ef-wo" name="work_order_id" defaultValue={defaults.work_order_id}>
                <option value="">— kein Auftrag —</option>
                {workOrders.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Notiz" htmlFor="ef-note" optional>
            <Textarea id="ef-note" name="note" rows={2} defaultValue={defaults.note} maxLength={1000} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-[var(--color-destructive)]">
              {error}
            </p>
          )}
        </CardBody>
        <CardFooter>
          <LinkButton href={onCancelHref} variant="ghost">
            Abbrechen
          </LinkButton>
          <SubmitButton label={mode === 'create' ? 'Zeit speichern' : 'Änderungen speichern'} />
        </CardFooter>
      </form>
    </Card>
  );
}
