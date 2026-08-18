'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { SignaturePad } from './signature-pad';
import type { WorkReportFormState } from './actions';

const INITIAL: WorkReportFormState = {};

type PropertyOption = { id: string; name: string; code: string | null };
type WorkOrderOption = { id: string; property_id: string; label: string };

type WorkReportRecord = {
  property_id?: string;
  work_order_id?: string | null;
  title?: string;
  performed_on?: string;
  description?: string;
  minutes_worked?: number | null;
  material_used?: string | null;
  signer_name?: string | null;
  signature_data?: string | null;
};

export function WorkReportForm({
  action,
  cancelHref,
  submitLabel,
  properties,
  workOrders,
  initial,
  defaultPropertyId,
  todayIso,
}: {
  action: (prev: WorkReportFormState, form: FormData) => Promise<WorkReportFormState>;
  cancelHref: string;
  submitLabel: string;
  properties: PropertyOption[];
  workOrders: WorkOrderOption[];
  initial?: WorkReportRecord;
  defaultPropertyId?: string;
  todayIso: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const err = state.fieldErrors ?? {};

  const [propertyId, setPropertyId] = useState<string>(
    initial?.property_id ?? defaultPropertyId ?? '',
  );

  const filteredWorkOrders = useMemo(
    () => workOrders.filter((w) => w.property_id === propertyId),
    [workOrders, propertyId],
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Leistung</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <Field label="Titel" htmlFor="title" error={err['title']}>
              <Input
                id="title"
                name="title"
                defaultValue={initial?.title ?? ''}
                required
                placeholder="z. B. Reparatur Eingangstür"
                autoFocus
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Objekt" htmlFor="property_id" error={err['property_id']}>
                <Select
                  id="property_id"
                  name="property_id"
                  required
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
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

              <Field label="Leistungsdatum" htmlFor="performed_on" error={err['performed_on']}>
                <Input
                  id="performed_on"
                  name="performed_on"
                  type="date"
                  defaultValue={initial?.performed_on ?? todayIso}
                  required
                />
              </Field>
            </div>

            <Field
              label="Auftrag"
              htmlFor="work_order_id"
              optional
              error={err['work_order_id']}
              hint={
                propertyId && filteredWorkOrders.length === 0
                  ? 'Für dieses Objekt gibt es keine Aufträge.'
                  : 'Bericht einem Auftrag zuordnen'
              }
            >
              <Select
                id="work_order_id"
                name="work_order_id"
                defaultValue={initial?.work_order_id ?? ''}
                disabled={filteredWorkOrders.length === 0}
              >
                <option value="">Ohne Auftrag</option>
                {filteredWorkOrders.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Durchgeführte Arbeiten" htmlFor="description" error={err['description']}>
              <Textarea
                id="description"
                name="description"
                rows={5}
                defaultValue={initial?.description ?? ''}
                required
                placeholder="Was wurde gemacht? Zustand, Vorgehen, Ergebnis …"
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Arbeitszeit (Minuten)"
                htmlFor="minutes_worked"
                optional
                error={err['minutes_worked']}
                hint="reine Arbeitszeit in Minuten"
              >
                <Input
                  id="minutes_worked"
                  name="minutes_worked"
                  type="number"
                  min={0}
                  max={100000}
                  defaultValue={initial?.minutes_worked ?? ''}
                  placeholder="z. B. 90"
                />
              </Field>
              <Field label="Material" htmlFor="material_used" optional error={err['material_used']}>
                <Input
                  id="material_used"
                  name="material_used"
                  defaultValue={initial?.material_used ?? ''}
                  placeholder="z. B. 1× Türschloss, 2 m Dichtung"
                />
              </Field>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bestätigung vor Ort</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <Field
              label="Name des Unterzeichners"
              htmlFor="signer_name"
              optional
              error={err['signer_name']}
              hint="Wer die Arbeit vor Ort abnimmt (Kunde, Bewohner, Hausverwaltung)"
            >
              <Input
                id="signer_name"
                name="signer_name"
                defaultValue={initial?.signer_name ?? ''}
                placeholder="Vor- und Nachname"
              />
            </Field>
            <SignaturePad name="signature_data" initialDataUrl={initial?.signature_data ?? null} />
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
