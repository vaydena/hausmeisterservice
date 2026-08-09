'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { TemplateFormState } from './actions';

const INITIAL: TemplateFormState = {};

type Template = {
  title?: string;
  description?: string | null;
  category?: string | null;
  active?: boolean;
};

export function TemplateForm({
  action,
  cancelHref,
  submitLabel,
  initial,
}: {
  action: (prev: TemplateFormState, form: FormData) => Promise<TemplateFormState>;
  cancelHref: string;
  submitLabel: string;
  initial?: Template;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Vorlage</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <Field label="Titel" htmlFor="title" error={err['title']}>
              <Input
                id="title"
                name="title"
                required
                defaultValue={initial?.title ?? ''}
                placeholder="z. B. Rauchmelder-Wartung DIN 14676"
                autoFocus
              />
            </Field>

            <Field label="Beschreibung" htmlFor="description" optional error={err['description']}>
              <Textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={initial?.description ?? ''}
                placeholder="Kurze Erläuterung, wann und wofür diese Checkliste genutzt wird."
              />
            </Field>

            <Field label="Kategorie" htmlFor="category" optional error={err['category']} hint="z. B. Brandschutz, Sanitär">
              <Input
                id="category"
                name="category"
                defaultValue={initial?.category ?? ''}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="active"
                defaultChecked={initial?.active ?? true}
                className="h-4 w-4 rounded border-[var(--color-border)]"
              />
              <span>Vorlage ist aktiv (für neue Ausführungen wählbar)</span>
            </label>
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
