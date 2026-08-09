'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { WorkOrderFormState } from './actions';

const INITIAL: WorkOrderFormState = {};

type Order = {
  title?: string;
  description?: string | null;
  category?: string | null;
  priority?: string;
  property_id?: string;
  building_id?: string | null;
  unit_id?: string | null;
  assignee_id?: string | null;
  planned_start?: string | null;
  planned_end?: string | null;
  deadline?: string | null;
  estimated_minutes?: number | null;
  is_emergency?: boolean;
};

function toLocalDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function WorkOrderForm({
  action,
  cancelHref,
  submitLabel,
  properties,
  employees,
  initial,
  defaultPropertyId,
}: {
  action: (prev: WorkOrderFormState, form: FormData) => Promise<WorkOrderFormState>;
  cancelHref: string;
  submitLabel: string;
  properties: { id: string; name: string; code: string | null }[];
  employees: { id: string; display_name: string }[];
  initial?: Order;
  defaultPropertyId?: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Auftrag</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <Field label="Titel" htmlFor="title" error={err['title']}>
              <Input id="title" name="title" defaultValue={initial?.title ?? ''} required autoFocus />
            </Field>

            <Field label="Beschreibung" htmlFor="description" optional error={err['description']}>
              <Textarea
                id="description"
                name="description"
                rows={4}
                defaultValue={initial?.description ?? ''}
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Kategorie" htmlFor="category" optional error={err['category']} hint="z.B. Reparatur, Reinigung, Wartung">
                <Input id="category" name="category" defaultValue={initial?.category ?? ''} />
              </Field>
              <Field label="Priorität" htmlFor="priority" error={err['priority']}>
                <Select
                  id="priority"
                  name="priority"
                  defaultValue={initial?.priority ?? 'normal'}
                  required
                >
                  <option value="low">Niedrig</option>
                  <option value="normal">Normal</option>
                  <option value="high">Hoch</option>
                  <option value="emergency">Notfall</option>
                </Select>
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="is_emergency"
                defaultChecked={initial?.is_emergency ?? false}
                className="h-4 w-4 rounded border-[var(--color-border)]"
              />
              <span>Notfall-Kennzeichnung (§41) – überschreibt normale Zuweisungslogik</span>
            </label>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zuordnung</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Objekt" htmlFor="property_id" error={err['property_id']}>
              <Select
                id="property_id"
                name="property_id"
                required
                defaultValue={initial?.property_id ?? defaultPropertyId ?? ''}
              >
                <option value="" disabled>
                  Objekt wählen …
                </option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${p.code} · ${p.name}` : p.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Zugewiesen an" htmlFor="assignee_id" optional error={err['assignee_id']}>
              <Select id="assignee_id" name="assignee_id" defaultValue={initial?.assignee_id ?? ''}>
                <option value="">Noch niemand</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.display_name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Terminierung</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Geplanter Start" htmlFor="planned_start" optional error={err['planned_start']}>
              <Input
                id="planned_start"
                name="planned_start"
                type="datetime-local"
                defaultValue={toLocalDateTime(initial?.planned_start)}
              />
            </Field>
            <Field label="Geplantes Ende" htmlFor="planned_end" optional error={err['planned_end']}>
              <Input
                id="planned_end"
                name="planned_end"
                type="datetime-local"
                defaultValue={toLocalDateTime(initial?.planned_end)}
              />
            </Field>
            <Field label="Deadline" htmlFor="deadline" optional error={err['deadline']}>
              <Input
                id="deadline"
                name="deadline"
                type="datetime-local"
                defaultValue={toLocalDateTime(initial?.deadline)}
              />
            </Field>
            <Field
              label="Geschätzt (Min)"
              htmlFor="estimated_minutes"
              optional
              error={err['estimated_minutes']}
            >
              <Input
                id="estimated_minutes"
                name="estimated_minutes"
                inputMode="numeric"
                defaultValue={initial?.estimated_minutes ?? ''}
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
          <Button type="submit" disabled={pending}>
            {pending ? 'Speichern …' : submitLabel}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
