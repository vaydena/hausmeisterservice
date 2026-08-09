'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { EVENT_KINDS, EVENT_KIND_LABEL, type EventKind } from '@/lib/schemas/vehicles';
import { recordVehicleEventAction } from './actions';

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Zeigt bei kind='tuev'/'service'/'insurance_renewal' das „nächste Frist"-Feld,
 * das dann in vehicles.next_tuev_at / next_service_at / insurance_expires_at
 * eingetragen wird (siehe actions.ts NEXT_DUE_FIELD).
 */
export function EventForm({ vehicleId, currentMileage }: { vehicleId: string; currentMileage: number | null }) {
  const [kind, setKind] = useState<EventKind>('service');

  const showNextDue = kind === 'tuev' || kind === 'service' || kind === 'insurance_renewal';
  const showMileage = kind !== 'insurance_renewal';
  const showCost = kind !== 'mileage_reading';
  const showVendor = kind !== 'mileage_reading';

  return (
    <form action={recordVehicleEventAction} className="flex flex-col gap-3 p-4">
      <input type="hidden" name="vehicle_id" value={vehicleId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Art" htmlFor={`ev-kind-${vehicleId}`}>
          <Select
            id={`ev-kind-${vehicleId}`}
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as EventKind)}
          >
            {EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {EVENT_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Datum" htmlFor={`ev-date-${vehicleId}`}>
          <Input
            id={`ev-date-${vehicleId}`}
            name="event_date"
            type="date"
            defaultValue={todayISO()}
            required
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {showMileage && (
          <Field
            label="Km-Stand"
            htmlFor={`ev-km-${vehicleId}`}
            optional
            hint={currentMileage !== null ? `zuletzt: ${currentMileage.toLocaleString('de-DE')} km` : undefined}
          >
            <Input
              id={`ev-km-${vehicleId}`}
              name="mileage_km"
              type="number"
              min="0"
              placeholder={currentMileage !== null ? String(currentMileage) : '0'}
            />
          </Field>
        )}
        {showCost && (
          <Field label="Kosten (EUR)" htmlFor={`ev-cost-${vehicleId}`} optional>
            <Input
              id={`ev-cost-${vehicleId}`}
              name="cost_eur"
              type="number"
              step="0.01"
              min="0"
            />
          </Field>
        )}
        {showVendor && (
          <Field label="Werkstatt/Tankstelle" htmlFor={`ev-vendor-${vehicleId}`} optional>
            <Input
              id={`ev-vendor-${vehicleId}`}
              name="vendor"
              placeholder="z. B. Bosch Service"
            />
          </Field>
        )}
      </div>

      {showNextDue && (
        <Field
          label="Nächste Fälligkeit"
          htmlFor={`ev-due-${vehicleId}`}
          optional
          hint="Wird auf dem Fahrzeug übernommen."
        >
          <Input id={`ev-due-${vehicleId}`} name="next_due_at" type="date" />
        </Field>
      )}

      <Field label="Notiz" htmlFor={`ev-note-${vehicleId}`} optional>
        <Textarea id={`ev-note-${vehicleId}`} name="note" rows={2} />
      </Field>

      <div className="flex justify-end">
        <Button type="submit">Ereignis erfassen</Button>
      </div>
    </form>
  );
}
