'use client';

import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { READING_SOURCES, SOURCE_LABEL } from '@/lib/schemas/meters';
import { addReadingAction } from './actions';

function toLocalInputValue(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
