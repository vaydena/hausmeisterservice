'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  SHIFT_COLORS,
  formatDurationHours,
  shiftCrossesMidnight,
  shiftGrossMinutes,
  shiftNetMinutes,
} from '@/lib/schemas/shifts';
import type { ShiftFormState } from './actions';

const INITIAL: ShiftFormState = {};

type ShiftRecord = {
  name?: string;
  short_code?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  break_minutes?: number;
  color?: string;
  sort_order?: number;
  active?: boolean;
  notes?: string | null;
};

export function ShiftForm({
  action,
  cancelHref,
  submitLabel,
  initial,
}: {
  action: (prev: ShiftFormState, form: FormData) => Promise<ShiftFormState>;
  cancelHref: string;
  submitLabel: string;
  initial?: ShiftRecord;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const err = state.fieldErrors ?? {};

  const [start, setStart] = useState<string>((initial?.start_time ?? '08:00').slice(0, 5));
  const [end, setEnd] = useState<string>((initial?.end_time ?? '16:00').slice(0, 5));
  const [breakMin, setBreakMin] = useState<number>(initial?.break_minutes ?? 30);
  const [color, setColor] = useState<string>(initial?.color ?? SHIFT_COLORS[0]);

  const preview = useMemo(() => {
    const gross = shiftGrossMinutes(start, end);
    const net = shiftNetMinutes(start, end, Number.isFinite(breakMin) ? breakMin : 0);
    return {
      gross,
      net,
      overnight: shiftCrossesMidnight(start, end),
    };
  }, [start, end, breakMin]);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Schichtmodell</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <Field label="Bezeichnung" htmlFor="name" error={err['name']}>
                <Input
                  id="name"
                  name="name"
                  defaultValue={initial?.name ?? ''}
                  required
                  placeholder="z. B. Frühschicht"
                  autoFocus
                />
              </Field>
              <Field
                label="Kürzel"
                htmlFor="short_code"
                optional
                error={err['short_code']}
                hint="für den Kalender, z. B. F"
              >
                <Input
                  id="short_code"
                  name="short_code"
                  defaultValue={initial?.short_code ?? ''}
                  maxLength={10}
                  className="w-24"
                  placeholder="F"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Beginn" htmlFor="start_time" error={err['start_time']}>
                <Input
                  id="start_time"
                  name="start_time"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  required
                />
              </Field>
              <Field label="Ende" htmlFor="end_time" error={err['end_time']}>
                <Input
                  id="end_time"
                  name="end_time"
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  required
                />
              </Field>
              <Field
                label="Pause (Min.)"
                htmlFor="break_minutes"
                error={err['break_minutes']}
              >
                <Input
                  id="break_minutes"
                  name="break_minutes"
                  type="number"
                  min={0}
                  max={1440}
                  value={Number.isFinite(breakMin) ? breakMin : 0}
                  onChange={(e) => setBreakMin(e.target.valueAsNumber)}
                  required
                />
              </Field>
            </div>

            {/*
              Live-Vorschau: die Nettozeit ist die Zahl, die spaeter zaehlt.
              Sie hier zu zeigen faengt Vertipper ab, bevor sie in der Planung
              landen — eine „Schicht" von 30 Minuten faellt sonst niemandem auf.
            */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-[var(--color-muted)] px-4 py-3 text-sm">
              <span>
                <span className="text-[var(--color-muted-foreground)]">Dauer: </span>
                <span className="font-medium">{formatDurationHours(preview.gross)}</span>
              </span>
              <span>
                <span className="text-[var(--color-muted-foreground)]">Netto (abzgl. Pause): </span>
                <span className="font-medium">{formatDurationHours(preview.net)}</span>
              </span>
              {preview.overnight && (
                <span className="text-[var(--color-muted-foreground)]">endet am Folgetag</span>
              )}
            </div>

            <Field label="Farbe" htmlFor="color" error={err['color']}>
              <input type="hidden" name="color" value={color} />
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Farbe">
                {SHIFT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    aria-label={c}
                    onClick={() => setColor(c)}
                    className={`size-8 rounded-full border-2 transition ${
                      color === c
                        ? 'border-[var(--color-foreground)] ring-2 ring-[var(--color-foreground)]/20'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Reihenfolge"
                htmlFor="sort_order"
                optional
                error={err['sort_order']}
                hint="kleinere Zahl steht oben"
              >
                <Input
                  id="sort_order"
                  name="sort_order"
                  type="number"
                  min={0}
                  max={9999}
                  defaultValue={initial?.sort_order ?? 0}
                />
              </Field>
              <Field label="Status" htmlFor="active">
                <label className="flex h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    id="active"
                    name="active"
                    value="true"
                    defaultChecked={initial?.active ?? true}
                    className="size-4 rounded border-[var(--color-border)]"
                  />
                  In Verwendung
                </label>
              </Field>
            </div>

            <Field label="Notizen" htmlFor="notes" optional error={err['notes']}>
              <Textarea
                id="notes"
                name="notes"
                rows={2}
                defaultValue={initial?.notes ?? ''}
                placeholder="Besonderheiten, Zuschläge, Zielgruppe …"
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
