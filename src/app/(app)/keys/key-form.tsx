'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { KEY_KINDS, KIND_LABEL } from '@/lib/schemas/keys';
import type { KeyFormState } from './actions';

const INITIAL: KeyFormState = {};

type BuildingRow = { id: string; property_id: string; name: string };
type UnitRow = { id: string; building_id: string; property_id: string; code: string };

type KeyRecord = {
  label?: string;
  identifier?: string | null;
  kind?: string;
  property_id?: string;
  building_id?: string | null;
  unit_id?: string | null;
  copies_total?: number;
  storage_location?: string | null;
  notes?: string | null;
};

export function KeyForm({
  action,
  cancelHref,
  submitLabel,
  properties,
  buildings,
  units,
  initial,
  defaultPropertyId,
}: {
  action: (prev: KeyFormState, form: FormData) => Promise<KeyFormState>;
  cancelHref: string;
  submitLabel: string;
  properties: { id: string; name: string; code: string | null }[];
  buildings: BuildingRow[];
  units: UnitRow[];
  initial?: KeyRecord;
  defaultPropertyId?: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const err = state.fieldErrors ?? {};

  const [propertyId, setPropertyId] = useState<string>(
    initial?.property_id ?? defaultPropertyId ?? '',
  );
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
          <CardTitle>Schlüssel</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <Field label="Bezeichnung" htmlFor="label" error={err['label']}>
              <Input
                id="label"
                name="label"
                defaultValue={initial?.label ?? ''}
                required
                placeholder="z. B. Haupteingang"
                autoFocus
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Schlüsselnummer"
                htmlFor="identifier"
                optional
                error={err['identifier']}
                hint="Serial-Nummer, Prägung oder interne Nummer"
              >
                <Input id="identifier" name="identifier" defaultValue={initial?.identifier ?? ''} />
              </Field>
              <Field label="Art" htmlFor="kind" error={err['kind']}>
                <Select
                  id="kind"
                  name="kind"
                  defaultValue={initial?.kind ?? 'other'}
                  required
                >
                  {KEY_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Exemplare (gesamt)"
                htmlFor="copies_total"
                error={err['copies_total']}
                hint="Wie viele physische Exemplare existieren"
              >
                <Input
                  id="copies_total"
                  name="copies_total"
                  type="number"
                  min={1}
                  max={999}
                  defaultValue={initial?.copies_total ?? 1}
                  required
                />
              </Field>
              <Field
                label="Aufbewahrungsort"
                htmlFor="storage_location"
                optional
                error={err['storage_location']}
                hint="z. B. „Schlüsselschrank A, Fach 12"
              >
                <Input
                  id="storage_location"
                  name="storage_location"
                  defaultValue={initial?.storage_location ?? ''}
                />
              </Field>
            </div>

            <Field label="Notizen" htmlFor="notes" optional error={err['notes']}>
              <Textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={initial?.notes ?? ''}
                placeholder="Besonderheiten, Sperrgruppe, Schließanlage …"
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zuordnung</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Objekt" htmlFor="property_id" error={err['property_id']}>
              <Select
                id="property_id"
                name="property_id"
                required
                value={propertyId}
                onChange={(e) => {
                  setPropertyId(e.target.value);
                  setBuildingId('');
                }}
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

            <Field label="Gebäude" htmlFor="building_id" optional error={err['building_id']}>
              <Select
                id="building_id"
                name="building_id"
                value={buildingId}
                onChange={(e) => setBuildingId(e.target.value)}
                disabled={filteredBuildings.length === 0}
              >
                <option value="">Ohne Zuordnung</option>
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
                <option value="">Ohne Zuordnung</option>
                {filteredUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code}
                  </option>
                ))}
              </Select>
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
