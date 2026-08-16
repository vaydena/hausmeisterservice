'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button, LinkButton } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ENTRY_KINDS,
  ENTRY_KIND_LABEL,
  formatDurationMinutes,
  minutesBetween,
} from '@/lib/schemas/time-tracking';
import { formatDateTime } from '@/lib/utils/format';

type Option = { id: string; label: string };

export type CurrentEntry = {
  id: string;
  kind: string;
  start_at: string;
  end_at: string | null;
  work_order_id: string | null;
  property_id: string | null;
  note: string | null;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Sende Antrag…' : 'Antrag senden'}
    </Button>
  );
}

// Sprint 113: zeigt die erfasste Zeit, gegen die der Antrag gestellt wird —
// muss dieselbe Zone benutzen wie das datetime-local-Feld darunter.
function fmt(iso: string): string {
  return formatDateTime(iso);
}

function labelFor(id: string | null, options: Option[]): string {
  if (!id) return '—';
  return options.find((o) => o.id === id)?.label ?? id;
}

export function CorrectionForm({
  entry,
  workOrders,
  properties,
  onCancelHref,
}: {
  entry: CurrentEntry;
  workOrders: Option[];
  properties: Option[];
  onCancelHref: string;
}) {
  const [error, setError] = useState<string | null>(null);

  async function handleAction(formData: FormData) {
    setError(null);
    const { requestCorrectionAction } = await import('../../../time-corrections/actions');
    try {
      await requestCorrectionAction(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Antrag fehlgeschlagen.');
    }
  }

  const currentDuration =
    entry.end_at !== null
      ? formatDurationMinutes(minutesBetween(entry.start_at, entry.end_at))
      : '—';

  return (
    <form action={handleAction} className="flex flex-col gap-6">
      <input type="hidden" name="time_entry_id" value={entry.id} />

      <Card>
        <CardHeader>
          <CardTitle>Aktuelle Werte</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <Row label="Art" value={ENTRY_KIND_LABEL[entry.kind as keyof typeof ENTRY_KIND_LABEL] ?? entry.kind} />
            <Row label="Dauer" value={currentDuration} />
            <Row label="Beginn" value={fmt(entry.start_at)} />
            <Row label="Ende" value={entry.end_at ? fmt(entry.end_at) : '— läuft noch —'} />
            <Row label="Objekt" value={labelFor(entry.property_id, properties)} />
            <Row label="Auftrag" value={labelFor(entry.work_order_id, workOrders)} />
            <div className="sm:col-span-2">
              <Row label="Notiz" value={entry.note ?? '—'} />
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vorgeschlagene Änderungen</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Nur ausgefüllte Felder werden vorgeschlagen. Leere Felder bleiben unverändert.
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Art" htmlFor="cf-kind" optional>
              <Select id="cf-kind" name="proposed_kind" defaultValue="">
                <option value="">— unverändert —</option>
                {ENTRY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ENTRY_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <div />
            <Field label="Beginn (neu)" htmlFor="cf-start" optional>
              <Input id="cf-start" name="proposed_start_at" type="datetime-local" />
            </Field>
            <Field label="Ende (neu)" htmlFor="cf-end" optional>
              <Input id="cf-end" name="proposed_end_at" type="datetime-local" />
            </Field>
            <Field label="Objekt" htmlFor="cf-prop" optional>
              <Select id="cf-prop" name="proposed_property_id" defaultValue="">
                <option value="">— unverändert —</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Auftrag" htmlFor="cf-wo" optional>
              <Select id="cf-wo" name="proposed_work_order_id" defaultValue="">
                <option value="">— unverändert —</option>
                {workOrders.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Notiz (neu)" htmlFor="cf-note" optional>
            <Textarea
              id="cf-note"
              name="proposed_note"
              rows={2}
              maxLength={1000}
              placeholder="Leer lassen = Notiz nicht ändern"
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Begründung</CardTitle>
        </CardHeader>
        <CardBody>
          <Field label="Warum ist eine Korrektur nötig?" htmlFor="cf-reason">
            <Textarea
              id="cf-reason"
              name="reason"
              rows={3}
              required
              minLength={3}
              maxLength={2000}
              placeholder="z. B. Punch beim Feierabend vergessen — Ende war tatsächlich 17:30"
            />
          </Field>
          {error && (
            <p role="alert" className="mt-2 text-sm text-[var(--color-destructive)]">
              {error}
            </p>
          )}
        </CardBody>
        <CardFooter>
          <LinkButton href={onCancelHref} variant="ghost">
            Abbrechen
          </LinkButton>
          <SubmitButton />
        </CardFooter>
      </Card>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-[var(--color-muted-foreground)]">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
