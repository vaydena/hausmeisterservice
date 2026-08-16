'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { createReportLinkAction, type ReportLinkFormState } from './actions';

const INITIAL: ReportLinkFormState = {};

export function CreateReportLinkForm({
  propertyId,
  buildings,
}: {
  propertyId: string;
  buildings: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    createReportLinkAction.bind(null, propertyId),
    INITIAL,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label="Bezeichnung"
        htmlFor="report-link-label"
        optional
        error={state.fieldErrors?.label}
        hint="Wo hängt der Aushang? Ohne Bezeichnung sind mehrere Aufkleber am selben Objekt später nicht auseinanderzuhalten."
      >
        <Input
          id="report-link-label"
          name="label"
          maxLength={120}
          placeholder="z. B. Haupteingang, Aushang neben den Briefkästen"
        />
      </Field>

      {buildings.length > 0 && (
        <Field
          label="Gebäude"
          htmlFor="report-link-building"
          optional
          hint="Gesetzt spart es dem Melder die Angabe, in welchem Haus er steht."
        >
          <Select id="report-link-building" name="building_id" defaultValue="">
            <option value="">Kein bestimmtes Gebäude</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Wird angelegt …' : 'Melde-Link anlegen'}
        </Button>
      </div>
    </form>
  );
}
