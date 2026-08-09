'use client';

import { useActionState, useState } from 'react';
import { Input, Select, Field } from '@/components/ui/input';
import { KIND_HINT, KIND_LABEL, type ChecklistItemKind } from '@/lib/schemas/checklists';
import type { ItemFormState } from './actions';

const INITIAL: ItemFormState = {};

export function AddItemForm({
  templateId,
  action,
}: {
  templateId: string;
  action: (prev: ItemFormState, form: FormData) => Promise<ItemFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [kind, setKind] = useState<ChecklistItemKind>('check');
  const err = state.fieldErrors ?? {};

  return (
    <form
      action={formAction}
      key={state.error ?? state.fieldErrors ? Math.random() : 'stable'}
      className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--color-border)] p-4"
    >
      <input type="hidden" name="template_id" value={templateId} />

      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
        <Field label="Bezeichnung" htmlFor="label" error={err['label']}>
          <Input
            id="label"
            name="label"
            required
            placeholder="z. B. Rauchmelder-Batterie geprüft"
          />
        </Field>
        <Field label="Art" htmlFor="kind" error={err['kind']} hint={KIND_HINT[kind]}>
          <Select
            id="kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ChecklistItemKind)}
          >
            {(Object.keys(KIND_LABEL) as ChecklistItemKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {kind === 'number' && (
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Einheit" htmlFor="unit" optional error={err['unit']} hint="z. B. °C, bar, %">
            <Input id="unit" name="unit" />
          </Field>
          <Field label="Min" htmlFor="min_value" optional error={err['min_value']}>
            <Input id="min_value" name="min_value" type="number" step="any" />
          </Field>
          <Field label="Max" htmlFor="max_value" optional error={err['max_value']}>
            <Input id="max_value" name="max_value" type="number" step="any" />
          </Field>
        </div>
      )}

      <Field label="Hinweis" htmlFor="help_text" optional error={err['help_text']}>
        <Input id="help_text" name="help_text" placeholder="Hilfetext für den Ausführenden (optional)" />
      </Field>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="required" className="h-4 w-4 rounded border-[var(--color-border)]" />
          <span>Pflichtfeld</span>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-60"
        >
          {pending ? 'Hinzufügen …' : 'Prüfpunkt hinzufügen'}
        </button>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}
    </form>
  );
}
