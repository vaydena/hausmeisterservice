'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { ResidentFormState } from './actions';

const INITIAL: ResidentFormState = {};

type BuildingRow = { id: string; property_id: string; name: string };
type UnitRow = { id: string; building_id: string; property_id: string; code: string };

type Resident = {
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  property_id?: string | null;
  building_id?: string | null;
  unit_id?: string | null;
  moved_in?: string | null;
  moved_out?: string | null;
  notes?: string | null;
};

export function ResidentForm({
  action,
  cancelHref,
  submitLabel,
  properties,
  buildings,
  units,
  initial,
}: {
  action: (prev: ResidentFormState, form: FormData) => Promise<ResidentFormState>;
  cancelHref: string;
  submitLabel: string;
  properties: { id: string; name: string; code: string | null }[];
  buildings: BuildingRow[];
  units: UnitRow[];
  initial?: Resident;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const err = state.fieldErrors ?? {};

  const [propertyId, setPropertyId] = useState<string>(initial?.property_id ?? '');
  const [buildingId, setBuildingId] = useState<string>(initial?.building_id ?? '');

  const filteredBuildings = useMemo(
    () => buildings.filter((b) => b.property_id === propertyId),
    [buildings, propertyId],
  );
  const filteredUnits = useMemo(
    () =>
      units.filter((u) =>
        buildingId ? u.building_id === buildingId : u.property_id === propertyId,
      ),
    [units, propertyId, buildingId],
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Person</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Vorname" htmlFor="first_name" error={err['first_name']}>
              <Input
                id="first_name"
                name="first_name"
                required
                defaultValue={initial?.first_name ?? ''}
                autoFocus
              />
            </Field>
            <Field label="Nachname" htmlFor="last_name" error={err['last_name']}>
              <Input
                id="last_name"
                name="last_name"
                required
                defaultValue={initial?.last_name ?? ''}
              />
            </Field>
            <Field label="E-Mail" htmlFor="email" optional error={err['email']}>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={initial?.email ?? ''}
              />
            </Field>
            <Field label="Telefon" htmlFor="phone" optional error={err['phone']}>
              <Input id="phone" name="phone" defaultValue={initial?.phone ?? ''} />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wohnort</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Objekt" htmlFor="property_id" optional error={err['property_id']}>
              <Select
                id="property_id"
                name="property_id"
                value={propertyId}
                onChange={(e) => {
                  setPropertyId(e.target.value);
                  setBuildingId('');
                }}
              >
                <option value="">Ohne Zuordnung</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${p.code} · ${p.name}` : p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Gebäude" htmlFor="building_id" optional error={err['building_id']}>
              <Select
                id="building_id"
                name="building_id"
                value={buildingId}
                onChange={(e) => setBuildingId(e.target.value)}
                disabled={filteredBuildings.length === 0}
              >
                <option value="">–</option>
                {filteredBuildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Einheit" htmlFor="unit_id" optional error={err['unit_id']}>
              <Select
                id="unit_id"
                name="unit_id"
                defaultValue={initial?.unit_id ?? ''}
                disabled={filteredUnits.length === 0}
              >
                <option value="">–</option>
                {filteredUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Einzug" htmlFor="moved_in" optional error={err['moved_in']}>
              <Input
                id="moved_in"
                name="moved_in"
                type="date"
                defaultValue={initial?.moved_in ?? ''}
              />
            </Field>
            <Field label="Auszug" htmlFor="moved_out" optional error={err['moved_out']}>
              <Input
                id="moved_out"
                name="moved_out"
                type="date"
                defaultValue={initial?.moved_out ?? ''}
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
              rows={4}
              defaultValue={initial?.notes ?? ''}
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
