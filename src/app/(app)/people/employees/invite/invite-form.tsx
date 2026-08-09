'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Select, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { inviteEmployeeAction, type EmployeeFormState } from '../actions';

const INITIAL: EmployeeFormState = {};

export function InviteForm({
  roles,
}: {
  roles: { key: string; name: string; description: string | null }[];
}) {
  const [state, formAction, pending] = useActionState(inviteEmployeeAction, INITIAL);
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>Einladung senden</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <Field label="E-Mail" htmlFor="email" error={err['email']}>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
              />
            </Field>
            <Field label="Anzeigename" htmlFor="display_name" error={err['display_name']}>
              <Input id="display_name" name="display_name" required maxLength={100} />
            </Field>
            <Field
              label="Rolle"
              htmlFor="role_key"
              error={err['role_key']}
              hint="Die Rolle bestimmt die Berechtigungen. Kann später geändert werden."
            >
              <Select id="role_key" name="role_key" required defaultValue="">
                <option value="" disabled>
                  Rolle wählen …
                </option>
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </Select>
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
            href="/people/employees"
            className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            Abbrechen
          </Link>
          <Button type="submit" disabled={pending}>
            {pending ? 'Einladung wird gesendet …' : 'Einladung senden'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
