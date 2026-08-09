'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { addStopAction } from './actions';

type PropertyOption = {
  id: string;
  name: string;
  street: string | null;
  house_number: string | null;
  city: string | null;
};

export function AddStopForm({ tourId, properties }: { tourId: string; properties: PropertyOption[] }) {
  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [label, setLabel] = useState<string>('');

  return (
    <form
      action={async (fd) => {
        await addStopAction(fd);
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="tour_id" value={tourId} />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Objekt" htmlFor="property_id" optional>
          <Select
            id="property_id"
            name="property_id"
            value={selectedProperty}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedProperty(id);
              const p = properties.find((x) => x.id === id);
              if (p && label.length === 0) {
                setLabel(p.name);
              }
            }}
          >
            <option value="">— freier Stopp —</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.city ? ` · ${p.city}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Bezeichnung" htmlFor="label">
          <Input
            id="label"
            name="label"
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="z. B. Objekt Musterstr. 5 / Tankstopp / Materiallager"
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Geplante Ankunft" htmlFor="planned_arrival_at" optional>
          <Input id="planned_arrival_at" name="planned_arrival_at" type="datetime-local" />
        </Field>
        <Field label="Geplante Abfahrt" htmlFor="planned_departure_at" optional>
          <Input id="planned_departure_at" name="planned_departure_at" type="datetime-local" />
        </Field>
        <Field label="Dauer (Min.)" htmlFor="duration_minutes" optional>
          <Input id="duration_minutes" name="duration_minutes" type="number" min="0" max="1440" />
        </Field>
      </div>

      <Field label="Notiz" htmlFor="note" optional>
        <Textarea id="note" name="note" rows={2} placeholder="Aufgabe, Ansprechpartner …" />
      </Field>

      <div className="flex justify-end">
        <Button type="submit">Stopp anhängen</Button>
      </div>
    </form>
  );
}

export function AddStopCard({ tourId, properties }: { tourId: string; properties: PropertyOption[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Neuen Stopp anhängen</CardTitle>
      </CardHeader>
      <CardBody>
        <AddStopForm tourId={tourId} properties={properties} />
      </CardBody>
      <CardFooter>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Objekt-Auswahl übernimmt den Namen automatisch als Bezeichnung.
        </p>
      </CardFooter>
    </Card>
  );
}
