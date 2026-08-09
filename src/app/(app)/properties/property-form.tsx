'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { PropertyFormState } from './actions';

const INITIAL: PropertyFormState = {};

type Property = {
  id?: string;
  code?: string | null;
  name?: string;
  property_type?: string | null;
  street?: string | null;
  house_number?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  notes?: string | null;
  access_notes?: string | null;
  emergency_notes?: string | null;
};

export function PropertyForm({
  action,
  cancelHref,
  initial,
  submitLabel,
}: {
  action: (prev: PropertyFormState, form: FormData) => Promise<PropertyFormState>;
  cancelHref: string;
  initial?: Property;
  submitLabel: string;
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
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name" htmlFor="name" error={err['name']}>
              <Input id="name" name="name" defaultValue={initial?.name ?? ''} required autoFocus />
            </Field>
            <Field label="Objekt-Nummer" htmlFor="code" optional hint="Frei lassen für Auto-Vergabe (P-001, P-002 …)" error={err['code']}>
              <Input id="code" name="code" defaultValue={initial?.code ?? ''} />
            </Field>
            <Field label="Typ" htmlFor="property_type" optional error={err['property_type']} hint="z.B. Mehrfamilienhaus, Gewerbe, Anlage">
              <Input id="property_type" name="property_type" defaultValue={initial?.property_type ?? ''} />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adresse</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 md:grid-cols-6">
            <div className="md:col-span-4">
              <Field label="Straße" htmlFor="street" optional error={err['street']}>
                <Input id="street" name="street" defaultValue={initial?.street ?? ''} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Nr." htmlFor="house_number" optional error={err['house_number']}>
                <Input id="house_number" name="house_number" defaultValue={initial?.house_number ?? ''} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="PLZ" htmlFor="postal_code" optional error={err['postal_code']}>
                <Input id="postal_code" name="postal_code" defaultValue={initial?.postal_code ?? ''} inputMode="numeric" />
              </Field>
            </div>
            <div className="md:col-span-3">
              <Field label="Ort" htmlFor="city" optional error={err['city']}>
                <Input id="city" name="city" defaultValue={initial?.city ?? ''} />
              </Field>
            </div>
            <div className="md:col-span-1">
              <Field label="Land" htmlFor="country" optional error={err['country']}>
                <Input id="country" name="country" defaultValue={initial?.country ?? 'DE'} maxLength={2} />
              </Field>
            </div>
            <div className="md:col-span-3">
              <Field label="GPS Breite" htmlFor="gps_lat" optional error={err['gps_lat']} hint="-90 bis 90">
                <Input id="gps_lat" name="gps_lat" defaultValue={initial?.gps_lat ?? ''} inputMode="decimal" />
              </Field>
            </div>
            <div className="md:col-span-3">
              <Field label="GPS Länge" htmlFor="gps_lng" optional error={err['gps_lng']} hint="-180 bis 180">
                <Input id="gps_lng" name="gps_lng" defaultValue={initial?.gps_lng ?? ''} inputMode="decimal" />
              </Field>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hinweise</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <Field label="Zugangshinweise" htmlFor="access_notes" optional error={err['access_notes']} hint="z.B. Schlüsselschrank-Nummer, Alarmcode-Standort">
              <Textarea id="access_notes" name="access_notes" defaultValue={initial?.access_notes ?? ''} />
            </Field>
            <Field label="Notfallhinweise" htmlFor="emergency_notes" optional error={err['emergency_notes']} hint="Nur bei Notfall relevant. Wird prominent angezeigt.">
              <Textarea id="emergency_notes" name="emergency_notes" defaultValue={initial?.emergency_notes ?? ''} />
            </Field>
            <Field label="Allgemeine Notizen" htmlFor="notes" optional error={err['notes']}>
              <Textarea id="notes" name="notes" defaultValue={initial?.notes ?? ''} />
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
