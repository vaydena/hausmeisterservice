'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { EmployeeFormState } from '../../actions';

const INITIAL: EmployeeFormState = {};

type Employee = {
  employment_status: string;
  hire_date: string | null;
  termination_date: string | null;
  hourly_rate: number | null;
  phone: string | null;
  skills: string[];
  notes: string | null;
};

export function EmployeeEditForm({
  action,
  cancelHref,
  initial,
}: {
  action: (prev: EmployeeFormState, form: FormData) => Promise<EmployeeFormState>;
  cancelHref: string;
  initial: Employee;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Status" htmlFor="employment_status" error={err['employment_status']}>
              <Select
                id="employment_status"
                name="employment_status"
                defaultValue={initial.employment_status}
                required
              >
                <option value="active">Aktiv</option>
                <option value="on_leave">Abwesend</option>
                <option value="terminated">Beendet</option>
              </Select>
            </Field>
            <Field label="Telefon" htmlFor="phone" optional error={err['phone']}>
              <Input id="phone" name="phone" defaultValue={initial.phone ?? ''} />
            </Field>
            <Field label="Eingestellt am" htmlFor="hire_date" optional error={err['hire_date']}>
              <Input id="hire_date" name="hire_date" type="date" defaultValue={initial.hire_date ?? ''} />
            </Field>
            <Field label="Beendet am" htmlFor="termination_date" optional error={err['termination_date']}>
              <Input
                id="termination_date"
                name="termination_date"
                type="date"
                defaultValue={initial.termination_date ?? ''}
              />
            </Field>
            <Field label="Stundensatz (€)" htmlFor="hourly_rate" optional error={err['hourly_rate']}>
              <Input
                id="hourly_rate"
                name="hourly_rate"
                inputMode="decimal"
                defaultValue={initial.hourly_rate ?? ''}
              />
            </Field>
            <Field
              label="Skills"
              htmlFor="skills_csv"
              optional
              error={err['skills_csv']}
              hint="Kommagetrennt (z.B. Sanitär, Elektrik, Winterdienst)"
            >
              <Input
                id="skills_csv"
                name="skills_csv"
                defaultValue={initial.skills.join(', ')}
              />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Notizen" htmlFor="notes" optional error={err['notes']}>
              <Textarea id="notes" name="notes" defaultValue={initial.notes ?? ''} />
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
            {pending ? 'Speichern …' : 'Änderungen speichern'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
