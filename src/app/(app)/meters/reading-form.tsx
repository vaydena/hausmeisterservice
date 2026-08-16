'use client';

import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { READING_SOURCES, SOURCE_LABEL } from '@/lib/schemas/meters';
import { addReadingAction } from './actions';
import { toLocalDateTimeInput } from '@/lib/utils/datetime-local';

// Sprint 113: Der Vorbelegungswert lief ueber getHours() und damit ueber die
// Zeitzone des Rechners, der rendert — beim Server-Rendering also die des
// Servers. Auf einem UTC-Server stand hier zwei Stunden vor der tatsaechlichen
// Uhrzeit, und wer den Vorschlag stehen laesst, datiert die Ablesung zurueck.
function toLocalInputValue(iso: string | null | undefined): string {
  return toLocalDateTimeInput(iso ?? new Date());
}

export function ReadingForm({
  meterId,
  unit,
  lastReading,
}: {
  meterId: string;
  unit: string;
  lastReading: number | null;
}) {
  return (
    <form action={addReadingAction} className="flex flex-col gap-3 p-4">
      <input type="hidden" name="meter_id" value={meterId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ablesezeitpunkt" htmlFor={`read-at-${meterId}`}>
          <Input
            id={`read-at-${meterId}`}
            name="read_at"
            type="datetime-local"
            defaultValue={toLocalInputValue(null)}
            required
          />
        </Field>
        <Field
          label={`Zählerstand (${unit})`}
          htmlFor={`reading-${meterId}`}
          hint={lastReading !== null ? `Letzter Stand: ${lastReading}` : undefined}
        >
          <Input
            id={`reading-${meterId}`}
            name="reading"
            type="number"
            step="0.0001"
            min={0}
            required
            placeholder={lastReading !== null ? String(lastReading) : '0'}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Quelle" htmlFor={`source-${meterId}`}>
          <Select id={`source-${meterId}`} name="source" defaultValue="manual">
            {READING_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_reset" value="on" className="h-4 w-4" />
            <span>Zählertausch / Reset</span>
          </label>
        </div>
      </div>
      <Field label="Notiz" htmlFor={`note-${meterId}`} optional>
        <Textarea id={`note-${meterId}`} name="note" rows={2} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit">Ablesung erfassen</Button>
      </div>
    </form>
  );
}
