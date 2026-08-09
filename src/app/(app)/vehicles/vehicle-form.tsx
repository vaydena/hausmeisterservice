'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FUEL_TYPES,
  FUEL_TYPE_LABEL,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABEL,
  type FuelType,
  type VehicleType,
} from '@/lib/schemas/vehicles';
import type { VehicleFormState } from './actions';

const INITIAL: VehicleFormState = {};

type VehicleRecord = {
  license_plate?: string;
  make?: string;
  model?: string;
  vehicle_type?: string;
  fuel_type?: string;
  year?: number | null;
  vin?: string | null;
  mileage_km?: number | null;
  primary_driver_user_id?: string | null;
  next_tuev_at?: string | null;
  next_service_at?: string | null;
  next_service_due_km?: number | null;
  insurance_expires_at?: string | null;
  storage_location?: string | null;
  notes?: string | null;
};

type UserOption = { id: string; display_name: string | null };

export function VehicleForm({
  action,
  cancelHref,
  submitLabel,
  users,
  initial,
}: {
  action: (prev: VehicleFormState, form: FormData) => Promise<VehicleFormState>;
  cancelHref: string;
  submitLabel: string;
  users: UserOption[];
  initial?: VehicleRecord;
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
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Kennzeichen" htmlFor="license_plate" error={err['license_plate']}>
                <Input
                  id="license_plate"
                  name="license_plate"
                  defaultValue={initial?.license_plate ?? ''}
                  required
                  placeholder="DÜ-AB 1234"
                  autoFocus
                  className="uppercase"
                />
              </Field>
              <Field label="Fahrzeugtyp" htmlFor="vehicle_type" error={err['vehicle_type']}>
                <Select
                  id="vehicle_type"
                  name="vehicle_type"
                  defaultValue={(initial?.vehicle_type as VehicleType) ?? 'car'}
                  required
                >
                  {VEHICLE_TYPES.map((k) => (
                    <option key={k} value={k}>
                      {VEHICLE_TYPE_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Kraftstoff" htmlFor="fuel_type" error={err['fuel_type']}>
                <Select
                  id="fuel_type"
                  name="fuel_type"
                  defaultValue={(initial?.fuel_type as FuelType) ?? 'diesel'}
                  required
                >
                  {FUEL_TYPES.map((k) => (
                    <option key={k} value={k}>
                      {FUEL_TYPE_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Marke" htmlFor="make" error={err['make']}>
                <Input
                  id="make"
                  name="make"
                  defaultValue={initial?.make ?? ''}
                  required
                  placeholder="VW, Mercedes …"
                />
              </Field>
              <Field label="Modell" htmlFor="model" error={err['model']}>
                <Input
                  id="model"
                  name="model"
                  defaultValue={initial?.model ?? ''}
                  required
                  placeholder="Caddy, Sprinter …"
                />
              </Field>
              <Field label="Baujahr" htmlFor="year" optional error={err['year']}>
                <Input
                  id="year"
                  name="year"
                  type="number"
                  min={1900}
                  max={2100}
                  defaultValue={initial?.year !== null && initial?.year !== undefined
                    ? String(initial.year)
                    : ''}
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Field label="VIN" htmlFor="vin" optional error={err['vin']}>
                <Input id="vin" name="vin" defaultValue={initial?.vin ?? ''} />
              </Field>
              <Field label="Km-Stand" htmlFor="mileage_km" optional error={err['mileage_km']}>
                <Input
                  id="mileage_km"
                  name="mileage_km"
                  type="number"
                  min="0"
                  defaultValue={initial?.mileage_km !== null && initial?.mileage_km !== undefined
                    ? String(initial.mileage_km)
                    : ''}
                />
              </Field>
              <Field
                label="Stellplatz"
                htmlFor="storage_location"
                optional
                error={err['storage_location']}
              >
                <Input
                  id="storage_location"
                  name="storage_location"
                  defaultValue={initial?.storage_location ?? ''}
                  placeholder="Hof 1 / Halle B …"
                />
              </Field>
            </div>

            <Field
              label="Verantwortlicher Fahrer"
              htmlFor="primary_driver_user_id"
              optional
              error={err['primary_driver_user_id']}
            >
              <Select
                id="primary_driver_user_id"
                name="primary_driver_user_id"
                defaultValue={initial?.primary_driver_user_id ?? ''}
              >
                <option value="">— nicht zugewiesen —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name ?? u.id.slice(0, 8)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fristen</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Nächster TÜV/HU"
              htmlFor="next_tuev_at"
              optional
              error={err['next_tuev_at']}
            >
              <Input
                id="next_tuev_at"
                name="next_tuev_at"
                type="date"
                defaultValue={initial?.next_tuev_at ?? ''}
              />
            </Field>
            <Field
              label="Nächster Service"
              htmlFor="next_service_at"
              optional
              error={err['next_service_at']}
            >
              <Input
                id="next_service_at"
                name="next_service_at"
                type="date"
                defaultValue={initial?.next_service_at ?? ''}
              />
            </Field>
            <Field
              label="Service fällig bei Km"
              htmlFor="next_service_due_km"
              optional
              error={err['next_service_due_km']}
            >
              <Input
                id="next_service_due_km"
                name="next_service_due_km"
                type="number"
                min="0"
                defaultValue={initial?.next_service_due_km !== null && initial?.next_service_due_km !== undefined
                  ? String(initial.next_service_due_km)
                  : ''}
              />
            </Field>
            <Field
              label="Versicherung läuft bis"
              htmlFor="insurance_expires_at"
              optional
              error={err['insurance_expires_at']}
            >
              <Input
                id="insurance_expires_at"
                name="insurance_expires_at"
                type="date"
                defaultValue={initial?.insurance_expires_at ?? ''}
              />
            </Field>
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
              placeholder="Besonderheiten, Ausstattung …"
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
