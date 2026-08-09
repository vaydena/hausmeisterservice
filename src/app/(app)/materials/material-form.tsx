'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { MATERIAL_CATEGORIES, CATEGORY_LABEL, type MaterialCategory } from '@/lib/schemas/materials';
import type { MaterialFormState } from './actions';

const INITIAL: MaterialFormState = {};

type MaterialRecord = {
  label?: string;
  sku?: string | null;
  category?: string;
  unit?: string;
  min_stock?: number | string;
  unit_cost?: number | string | null;
  storage_location?: string | null;
  supplier?: string | null;
  notes?: string | null;
};

export function MaterialForm({
  action,
  cancelHref,
  submitLabel,
  initial,
  defaultCategory,
}: {
  action: (prev: MaterialFormState, form: FormData) => Promise<MaterialFormState>;
  cancelHref: string;
  submitLabel: string;
  initial?: MaterialRecord;
  defaultCategory?: MaterialCategory;
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
          <div className="flex flex-col gap-4">
            <Field label="Bezeichnung" htmlFor="label" error={err['label']}>
              <Input
                id="label"
                name="label"
                defaultValue={initial?.label ?? ''}
                required
                placeholder="z. B. Glühlampe E27 60W"
                autoFocus
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Artikelnr. / SKU" htmlFor="sku" optional error={err['sku']}>
                <Input id="sku" name="sku" defaultValue={initial?.sku ?? ''} />
              </Field>
              <Field label="Kategorie" htmlFor="category" error={err['category']}>
                <Select
                  id="category"
                  name="category"
                  defaultValue={initial?.category ?? defaultCategory ?? 'other'}
                  required
                >
                  {MATERIAL_CATEGORIES.map((k) => (
                    <option key={k} value={k}>
                      {CATEGORY_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Einheit" htmlFor="unit" error={err['unit']}>
                <Input
                  id="unit"
                  name="unit"
                  defaultValue={initial?.unit ?? 'Stk'}
                  required
                  placeholder="Stk, l, kg, m …"
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Meldebestand"
                htmlFor="min_stock"
                error={err['min_stock']}
                hint="Warnschwelle für Nachbestellung"
              >
                <Input
                  id="min_stock"
                  name="min_stock"
                  type="number"
                  step="0.001"
                  min="0"
                  defaultValue={String(initial?.min_stock ?? '0')}
                />
              </Field>
              <Field label="Stückpreis (EUR)" htmlFor="unit_cost" optional error={err['unit_cost']}>
                <Input
                  id="unit_cost"
                  name="unit_cost"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={initial?.unit_cost !== null && initial?.unit_cost !== undefined
                    ? String(initial.unit_cost)
                    : ''}
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Lagerplatz"
                htmlFor="storage_location"
                optional
                error={err['storage_location']}
              >
                <Input
                  id="storage_location"
                  name="storage_location"
                  defaultValue={initial?.storage_location ?? ''}
                  placeholder='z. B. „Regal A2"'
                />
              </Field>
              <Field label="Lieferant" htmlFor="supplier" optional error={err['supplier']}>
                <Input
                  id="supplier"
                  name="supplier"
                  defaultValue={initial?.supplier ?? ''}
                  placeholder="Bezugsquelle"
                />
              </Field>
            </div>

            <Field label="Notizen" htmlFor="notes" optional error={err['notes']}>
              <Textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={initial?.notes ?? ''}
                placeholder="Hersteller, Ersatzhinweise …"
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
