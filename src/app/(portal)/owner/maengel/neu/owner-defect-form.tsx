'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { createOwnerDefectAction, type OwnerDefectFormState } from '../actions';

const INITIAL: OwnerDefectFormState = {};

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Niedrig' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Hoch' },
  { value: 'emergency', label: 'Notfall' },
] as const;

const inputClass =
  'rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20';

export function OwnerDefectForm({
  properties,
}: {
  properties: { id: string; name: string | null; code: string | null }[];
}) {
  const [state, formAction, pending] = useActionState(createOwnerDefectAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Objekt</span>
        <select
          name="property_id"
          required
          defaultValue={properties.length === 1 ? properties[0]!.id : ''}
          className={inputClass}
        >
          <option value="" disabled>
            Objekt wählen …
          </option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code ? `${p.code} · ${p.name ?? 'Objekt'}` : (p.name ?? 'Objekt')}
            </option>
          ))}
        </select>
        {state.fieldErrors?.property_id && (
          <span className="text-xs text-[var(--color-destructive)]">
            {state.fieldErrors.property_id}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Titel</span>
        <input type="text" name="title" required maxLength={200} className={inputClass} />
        {state.fieldErrors?.title && (
          <span className="text-xs text-[var(--color-destructive)]">{state.fieldErrors.title}</span>
        )}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Beschreibung</span>
        <textarea name="description" rows={4} className={inputClass} />
        <span className="text-xs text-[var(--color-muted-foreground)]">
          Was ist wo aufgefallen? Je genauer, desto schneller kann die Hausverwaltung reagieren.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Ort / Lage (optional)</span>
        <input
          type="text"
          name="location_details"
          maxLength={200}
          placeholder="z. B. Treppenhaus 2. OG, Tiefgarage Stellplatz 14"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Dringlichkeit</span>
        <select name="priority" defaultValue="normal" className={inputClass}>
          {PRIORITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Wird gemeldet …' : 'Mangel melden'}
        </button>
        <Link
          href="/owner/maengel"
          className="text-sm text-[var(--color-muted-foreground)] hover:underline"
        >
          Abbrechen
        </Link>
      </div>
    </form>
  );
}
