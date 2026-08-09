'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { TourFormState } from './actions';

const INITIAL: TourFormState = {};

type TourRecord = {
  title?: string;
  planned_date?: string;
  driver_user_id?: string | null;
  vehicle_id?: string | null;
  notes?: string | null;
};

type UserOption = { id: string; display_name: string | null };
type VehicleOption = { id: string; license_plate: string; make: string; model: string };

export function TourForm({
  action,
  cancelHref,
  submitLabel,
  users,
  vehicles,
  initial,
}: {
  action: (prev: TourFormState, form: FormData) => Promise<TourFormState>;
  cancelHref: string;
  submitLabel: string;
  users: UserOption[];
  vehicles: VehicleOption[];
  initial?: TourRecord;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <Field label="Titel" htmlFor="title" error={err['title']}>
              <Input
                id="title"
                name="title"
                defaultValue={initial?.title ?? ''}
                required
                placeholder="z. B. Reinigung Nord-Route"
                autoFocus
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Datum" htmlFor="planned_date" error={err['planned_date']}>
                <Input
                  id="planned_date"
                  name="planned_date"
                  type="date"
                  defaultValue={initial?.planned_date ?? new Date().toISOString().slice(0, 10)}
                  required
                />
              </Field>
              <Field
                label="Fahrer"
                htmlFor="driver_user_id"
                optional
                error={err['driver_user_id']}
              >
                <Select
                  id="driver_user_id"
                  name="driver_user_id"
                  defaultValue={initial?.driver_user_id ?? ''}
                >
                  <option value="">— nicht zugewiesen —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name ?? u.id.slice(0, 8)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Fahrzeug" htmlFor="vehicle_id" optional error={err['vehicle_id']}>
                <Select
                  id="vehicle_id"
                  name="vehicle_id"
                  defaultValue={initial?.vehicle_id ?? ''}
                >
                  <option value="">— nicht zugewiesen —</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.license_plate} · {v.make} {v.model}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notizen</CardTitle>
        </CardHeader>
        <CardBody>
          <Field label="Notizen" htmlFor="notes" optional error={err['notes']}>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={initial?.notes ?? ''}
              placeholder="Route-Hinweise, Besonderheiten …"
            />
          </Field>
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
