'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { OWNER_KIND_LABEL, type OwnerKind } from '@/lib/schemas/owners';
import type { OwnerFormState } from './actions';

const INITIAL: OwnerFormState = {};

type Owner = {
  kind?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  house_number?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
};

export function OwnerForm({
  action,
  cancelHref,
  submitLabel,
  initial,
}: {
  action: (prev: OwnerFormState, form: FormData) => Promise<OwnerFormState>;
  cancelHref: string;
  submitLabel: string;
  initial?: Owner;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const err = state.fieldErrors ?? {};
  const [kind, setKind] = useState<OwnerKind>(
    (initial?.kind as OwnerKind | undefined) ?? 'individual',
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Art</CardTitle>
        </CardHeader>
        <CardBody>
          <Field label="Eigentümer-Typ" htmlFor="kind" error={err['kind']}>
            <Select
              id="kind"
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as OwnerKind)}
              required
            >
              {(Object.keys(OWNER_KIND_LABEL) as OwnerKind[]).map((k) => (
                <option key={k} value={k}>
                  {OWNER_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Person / Firma</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            {kind === 'individual' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Vorname" htmlFor="first_name" error={err['first_name']}>
                  <Input
                    id="first_name"
                    name="first_name"
                    required
                    defaultValue={initial?.first_name ?? ''}
                    autoFocus
                  />
                </Field>
                <Field label="Nachname" htmlFor="last_name" error={err['last_name']}>
                  <Input
                    id="last_name"
                    name="last_name"
                    required
                    defaultValue={initial?.last_name ?? ''}
                  />
                </Field>
              </div>
            ) : (
              <Field label="Firmenname" htmlFor="company_name" error={err['company_name']}>
                <Input
                  id="company_name"
                  name="company_name"
                  required
                  defaultValue={initial?.company_name ?? ''}
                  autoFocus
                />
              </Field>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="E-Mail" htmlFor="email" optional error={err['email']}>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={initial?.email ?? ''}
                />
              </Field>
              <Field label="Telefon" htmlFor="phone" optional error={err['phone']}>
                <Input id="phone" name="phone" defaultValue={initial?.phone ?? ''} />
              </Field>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adresse</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-3">
              <Field label="Straße" htmlFor="street" optional error={err['street']}>
                <Input id="street" name="street" defaultValue={initial?.street ?? ''} />
              </Field>
            </div>
            <Field label="Nr." htmlFor="house_number" optional error={err['house_number']}>
              <Input
                id="house_number"
                name="house_number"
                defaultValue={initial?.house_number ?? ''}
              />
            </Field>
            <Field label="PLZ" htmlFor="postal_code" optional error={err['postal_code']}>
              <Input
                id="postal_code"
                name="postal_code"
                defaultValue={initial?.postal_code ?? ''}
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Ort" htmlFor="city" optional error={err['city']}>
                <Input id="city" name="city" defaultValue={initial?.city ?? ''} />
              </Field>
            </div>
            <Field label="Land" htmlFor="country" optional error={err['country']}>
              <Input id="country" name="country" defaultValue={initial?.country ?? 'DE'} />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notizen</CardTitle>
        </CardHeader>
        <CardBody>
          <Field label="Notizen" htmlFor="notes" optional error={err['notes']}>
            <Textarea id="notes" name="notes" rows={4} defaultValue={initial?.notes ?? ''} />
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
