'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  UTILITY_KINDS,
  UTILITY_LABEL,
  UTILITY_DEFAULT_UNIT,
  type UtilityKind,
} from '@/lib/schemas/meters';
import type { MeterFormState } from './actions';

const INITIAL: MeterFormState = {};

type BuildingRow = { id: string; property_id: string; name: string };
type UnitRow = { id: string; building_id: string; property_id: string; code: string };

type MeterRecord = {
  label?: string;
  meter_number?: string | null;
  utility_kind?: string;
  unit_of_measure?: string;
  property_id?: string;
  building_id?: string | null;
  unit_id?: string | null;
  location_note?: string | null;
  digits_before?: number;
  digits_after?: number;
  installed_at?: string | null;
  last_replacement_at?: string | null;
  notes?: string | null;
};

export function MeterForm({
  action,
  cancelHref,
  submitLabel,
  properties,
  buildings,
  units,
  initial,
  defaultPropertyId,
}: {
  action: (prev: MeterFormState, form: FormData) => Promise<MeterFormState>;
  cancelHref: string;
  submitLabel: string;
  properties: { id: string; name: string; code: string | null }[];
  buildings: BuildingRow[];
  units: UnitRow[];
  initial?: MeterRecord;
  defaultPropertyId?: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const err = state.fieldErrors ?? {};

  const [propertyId, setPropertyId] = useState<string>(
    initial?.property_id ?? defaultPropertyId ?? '',
  );
  const [buildingId, setBuildingId] = useState<string>(initial?.building_id ?? '');
  const [utilityKind, setUtilityKind] = useState<UtilityKind>(
    (initial?.utility_kind as UtilityKind) ?? 'electricity',
  );
  const [unit, setUnit] = useState<string>(
    initial?.unit_of_measure ?? UTILITY_DEFAULT_UNIT.electricity,
  );

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
          <CardTitle>Zähler</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <Field label="Bezeichnung" htmlFor="label" error={err['label']}>
              <Input
                id="label"
                name="label"
                defaultValue={initial?.label ?? ''}
                required
                placeholder="z. B. Stromzähler Allgemein"
                autoFocus
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Zählernummer"
                htmlFor="meter_number"
                optional
                error={err['meter_number']}
                hint="Nummer des Zählers/Serials"
              >
                <Input id="meter_number" name="meter_number" defaultValue={initial?.meter_number ?? ''} />
              </Field>
              <Field label="Aufstellort" htmlFor="location_note" optional error={err['location_note']}>
                <Input
                  id="location_note"
                  name="location_note"
                  defaultValue={initial?.location_note ?? ''}
                  placeholder='z. B. „Keller Raum K-01"'
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Medium" htmlFor="utility_kind" error={err['utility_kind']}>
                <Select
                  id="utility_kind"
                  name="utility_kind"
                  value={utilityKind}
                  onChange={(e) => {
                    const next = e.target.value as UtilityKind;
                    setUtilityKind(next);
                    if (!initial) setUnit(UTILITY_DEFAULT_UNIT[next] || unit);
                  }}
                  required
                >
                  {UTILITY_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {UTILITY_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Einheit" htmlFor="unit_of_measure" error={err['unit_of_measure']}>
                <Input
                  id="unit_of_measure"
                  name="unit_of_measure"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  required
                  placeholder="kWh, m³ …"
                />
              </Field>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Vorkomma" htmlFor="digits_before" error={err['digits_before']}>
                  <Input
                    id="digits_before"
                    name="digits_before"
                    type="number"
                    min={1}
                    max={10}
                    defaultValue={initial?.digits_before ?? 5}
                  />
                </Field>
                <Field label="Nachkomma" htmlFor="digits_after" error={err['digits_after']}>
                  <Input
                    id="digits_after"
                    name="digits_after"
                    type="number"
                    min={0}
                    max={4}
                    defaultValue={initial?.digits_after ?? 0}
                  />
                </Field>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Einbaudatum"
                htmlFor="installed_at"
                optional
                error={err['installed_at']}
              >
                <Input
                  id="installed_at"
                  name="installed_at"
                  type="date"
                  defaultValue={initial?.installed_at ?? ''}
                />
              </Field>
              <Field
                label="Letzter Wechsel"
                htmlFor="last_replacement_at"
                optional
                error={err['last_replacement_at']}
              >
                <Input
                  id="last_replacement_at"
                  name="last_replacement_at"
                  type="date"
                  defaultValue={initial?.last_replacement_at ?? ''}
                />
              </Field>
            </div>

            <Field label="Notizen" htmlFor="notes" optional error={err['notes']}>
              <Textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={initial?.notes ?? ''}
                placeholder="Besonderheiten, Eichfrist …"
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
