'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { REPORTER_KIND_LABEL, PRIORITY_LABEL } from '@/lib/schemas/defect-reports';
import type { DefectReportFormState } from './actions';

const INITIAL: DefectReportFormState = {};

type BuildingRow = { id: string; property_id: string; name: string };
type UnitRow = { id: string; building_id: string; property_id: string; code: string };

type Report = {
  title?: string;
  description?: string | null;
  category?: string | null;
  priority?: string;
  property_id?: string;
  building_id?: string | null;
  unit_id?: string | null;
  location_details?: string | null;
  reporter_kind?: string;
  reporter_name?: string | null;
  reporter_contact?: string | null;
};

export function ReportForm({
  action,
  cancelHref,
  submitLabel,
  properties,
  buildings,
  units,
  initial,
  defaultPropertyId,
}: {
  action: (prev: DefectReportFormState, form: FormData) => Promise<DefectReportFormState>;
  cancelHref: string;
  submitLabel: string;
  properties: { id: string; name: string; code: string | null }[];
  buildings: BuildingRow[];
  units: UnitRow[];
  initial?: Report;
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
    () => units.filter((u) => (buildingId ? u.building_id === buildingId : u.property_id === propertyId)),
    [units, propertyId, buildingId],
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Meldung</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <Field label="Titel" htmlFor="title" error={err['title']}>
              <Input
                id="title"
                name="title"
                defaultValue={initial?.title ?? ''}
                required
                placeholder="z. B. Wasserfleck in der Decke"
                autoFocus
              />
            </Field>

            <Field label="Beschreibung" htmlFor="description" optional error={err['description']}>
              <Textarea
                id="description"
                name="description"
                rows={4}
                defaultValue={initial?.description ?? ''}
                placeholder="Was ist passiert, wann bemerkt, was ist der Auslöser …"
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Kategorie" htmlFor="category" optional error={err['category']} hint="z. B. Wasser, Elektro, Reinigung">
                <Input id="category" name="category" defaultValue={initial?.category ?? ''} />
              </Field>
              <Field label="Priorität" htmlFor="priority" error={err['priority']}>
                <Select
                  id="priority"
                  name="priority"
                  defaultValue={initial?.priority ?? 'normal'}
                  required
                >
                  {(['low', 'normal', 'high', 'emergency'] as const).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
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
          <CardTitle>Ort</CardTitle>
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

          <div className="mt-4">
            <Field
              label="Standort-Detail"
              htmlFor="location_details"
              optional
              hint={'z. B. „Kellerraum links neben Zähler"'}
            >
              <Input
                id="location_details"
                name="location_details"
                defaultValue={initial?.location_details ?? ''}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meldender</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Rolle" htmlFor="reporter_kind" error={err['reporter_kind']}>
              <Select
                id="reporter_kind"
                name="reporter_kind"
                defaultValue={initial?.reporter_kind ?? 'staff'}
              >
                {(['staff', 'resident', 'owner', 'anonymous'] as const).map((k) => (
                  <option key={k} value={k}>
                    {REPORTER_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Name" htmlFor="reporter_name" optional error={err['reporter_name']}>
              <Input
                id="reporter_name"
                name="reporter_name"
                defaultValue={initial?.reporter_name ?? ''}
                placeholder="Falls externer Melder"
              />
            </Field>
            <Field
              label="Kontakt"
              htmlFor="reporter_contact"
              optional
              hint="Telefon oder E-Mail für Rückfragen"
              error={err['reporter_contact']}
            >
              <Input
                id="reporter_contact"
                name="reporter_contact"
                defaultValue={initial?.reporter_contact ?? ''}
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
