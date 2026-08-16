'use client';

import { useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ENTRY_KINDS,
  ENTRY_KIND_LABEL,
  ENTRY_KIND_TONE,
  type TimeEntryKind,
} from '@/lib/schemas/time-tracking';
import { punchInAction, punchOutAction } from './actions';
import { formatTime } from '@/lib/utils/format';

type Option = { id: string; label: string };
type OpenEntry = {
  id: string;
  kind: string;
  start_at: string;
  work_order_id: string | null;
  property_id: string | null;
  note: string | null;
};

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function SubmitButton({
  label,
  variant = 'primary',
  disabled = false,
}: {
  label: string;
  variant?: 'primary' | 'destructive' | 'outline';
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending || disabled}>
      {pending ? 'Bitte warten…' : label}
    </Button>
  );
}

export function PunchWidget({
  openEntry,
  workOrders,
  properties,
}: {
  openEntry: OpenEntry | null;
  workOrders: Option[];
  properties: Option[];
}) {
  if (openEntry) {
    return <OpenPanel entry={openEntry} workOrders={workOrders} properties={properties} />;
  }
  return <StartPanel workOrders={workOrders} properties={properties} />;
}

function StartPanel({ workOrders, properties }: { workOrders: Option[]; properties: Option[] }) {
  const [kind, setKind] = useState<TimeEntryKind>('work');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Zeit stempeln</CardTitle>
      </CardHeader>
      <CardBody>
        <form action={punchInAction} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Art" htmlFor="tt-kind">
              <Select
                id="tt-kind"
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as TimeEntryKind)}
              >
                {ENTRY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ENTRY_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Objekt" htmlFor="tt-property" optional>
              <Select id="tt-property" name="property_id" defaultValue="">
                <option value="">— kein Objektbezug —</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Auftrag" htmlFor="tt-wo" optional>
              <Select id="tt-wo" name="work_order_id" defaultValue="">
                <option value="">— kein Auftrag —</option>
                {workOrders.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notiz" htmlFor="tt-note" optional>
              <Input id="tt-note" name="note" type="text" maxLength={1000} />
            </Field>
          </div>
          <div className="flex justify-end">
            <SubmitButton label="Einstempeln" />
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function OpenPanel({
  entry,
  workOrders,
  properties,
}: {
  entry: OpenEntry;
  workOrders: Option[];
  properties: Option[];
}) {
  const [now, setNow] = useState<number>(() => Date.now());
  const start = new Date(entry.start_at).getTime();
  const elapsed = formatElapsed(now - start);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const kind = entry.kind as TimeEntryKind;
  const wo = entry.work_order_id ? workOrders.find((w) => w.id === entry.work_order_id) : null;
  const prop = entry.property_id ? properties.find((p) => p.id === entry.property_id) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aktive Zeit</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={ENTRY_KIND_TONE[kind] ?? 'neutral'}>
            {ENTRY_KIND_LABEL[kind] ?? entry.kind}
          </Badge>
          <span
            className="rounded-md bg-[var(--color-muted)] px-3 py-1 font-mono text-2xl font-semibold tabular-nums"
            aria-live="polite"
          >
            {elapsed}
          </span>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            gestartet {formatTime(entry.start_at)}
          </span>
        </div>

        {(wo || prop) && (
          <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {prop && (
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-muted-foreground)]">Objekt</dt>
                <dd className="truncate text-right">{prop.label}</dd>
              </div>
            )}
            {wo && (
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-muted-foreground)]">Auftrag</dt>
                <dd className="truncate text-right">{wo.label}</dd>
              </div>
            )}
          </dl>
        )}

        {entry.note && (
          <p className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
            {entry.note}
          </p>
        )}

        <form action={punchOutAction} className="flex flex-col gap-3">
          <Field label="Notiz beim Beenden" htmlFor="tt-note-out" optional>
            <Input
              id="tt-note-out"
              name="note"
              type="text"
              maxLength={1000}
              defaultValue={entry.note ?? ''}
            />
          </Field>
          <div className="flex justify-end">
            <SubmitButton label="Ausstempeln" variant="destructive" />
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
