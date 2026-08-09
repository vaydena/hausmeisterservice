'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { INTERVAL_PRESETS } from '@/lib/schemas/maintenance';
import type { MaintenancePlanFormState } from './actions';

const INITIAL: MaintenancePlanFormState = {};

type BuildingRow = { id: string; property_id: string; name: string };
type UnitRow = { id: string; building_id: string; property_id: string; code: string };

type Plan = {
  title?: string;
  description?: string | null;
  category?: string | null;
  property_id?: string;
  building_id?: string | null;
  unit_id?: string | null;
  interval_days?: number;
  estimated_minutes?: number | null;
  priority?: string;
  assigned_role?: string | null;
  next_due_at?: string | null;
  active?: boolean;
  notes?: string | null;
};

export function PlanForm({
  action,
  cancelHref,
  submitLabel,
  properties,
  buildings,
  units,
  initial,
}: {
  action: (
    prev: MaintenancePlanFormState,
    form: FormData,
  ) => Promise<MaintenancePlanFormState>;
  cancelHref: string;
  submitLabel: string;
  properties: { id: string; name: string; code: string | null }[];
  buildings: BuildingRow[];
  units: UnitRow[];
  initial?: Plan;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const err = state.fieldErrors ?? {};

  const [propertyId, setPropertyId] = useState<string>(initial?.property_id ?? '');
  const [buildingId, setBuildingId] = useState<string>(initial?.building_id ?? '');
  const [intervalDays, setIntervalDays] = useState<string>(
    String(initial?.interval_days ?? 90),
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
          <CardTitle>Wartungsplan</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <Field label="Titel" htmlFor="title" error={err['title']}>
              <Input
                id="title"
                name="title"
                required
                defaultValue={initial?.title ?? ''}
                placeholder="z. B. Heizung – Jahreswartung"
                autoFocus
              />
            </Field>

            <Field label="Beschreibung" htmlFor="description" optional error={err['description']}>
              <Textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={initial?.description ?? ''}
                placeholder="Was ist zu prüfen? Welche Prüfmittel werden benötigt?"
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Kategorie" htmlFor="category" optional error={err['category']}>
                <Input
                  id="category"
                  name="category"
                  defaultValue={initial?.category ?? ''}
                  placeholder="z. B. Heizung, Brandschutz, Aufzug"
                />
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
                <option value="">Alle</option>
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
                <option value="">Alle</option>
                {filteredUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wiederholung</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Intervall" htmlFor="interval_days" error={err['interval_days']}>
              <div className="flex gap-2">
                <Select
                  className="w-40"
                  value={
                    INTERVAL_PRESETS.some((p) => String(p.days) === intervalDays)
                      ? intervalDays
                      : ''
                  }
                  onChange={(e) => {
                    if (e.target.value) setIntervalDays(e.target.value);
                  }}
                >
                  <option value="">Individuell …</option>
                  {INTERVAL_PRESETS.map((p) => (
                    <option key={p.days} value={String(p.days)}>
                      {p.label}
                    </option>
                  ))}
                </Select>
                <Input
                  id="interval_days"
                  name="interval_days"
                  type="number"
                  min="1"
                  max="3650"
                  required
                  value={intervalDays}
                  onChange={(e) => setIntervalDays(e.target.value)}
                />
                <span className="flex items-center text-sm text-[var(--color-muted-foreground)]">
                  Tage
                </span>
              </div>
            </Field>
            <Field label="Nächste Fälligkeit" htmlFor="next_due_at" optional error={err['next_due_at']}>
              <Input
                id="next_due_at"
                name="next_due_at"
                type="date"
                defaultValue={initial?.next_due_at ?? ''}
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
                type="number"
                min="1"
                defaultValue={initial?.estimated_minutes ?? ''}
              />
            </Field>
            <Field
              label="Zuständige Rolle"
              htmlFor="assigned_role"
              optional
              hint="z. B. Hausmeister, Technik"
              error={err['assigned_role']}
            >
              <Input
                id="assigned_role"
                name="assigned_role"
                defaultValue={initial?.assigned_role ?? ''}
              />
            </Field>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={initial?.active ?? true}
              className="h-4 w-4 rounded border-[var(--color-border)]"
            />
            <span>Plan ist aktiv (erzeugt fällige Termine)</span>
          </label>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notizen</CardTitle>
        </CardHeader>
        <CardBody>
          <Field label="Notizen" htmlFor="notes" optional error={err['notes']}>
            <Textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes ?? ''} />
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
