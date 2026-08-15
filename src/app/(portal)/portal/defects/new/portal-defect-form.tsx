'use client';

import { useActionState, useState } from 'react';
import { AlertTriangle, Paperclip } from 'lucide-react';
import { createPortalDefectAction, type PortalDefectFormState } from '../actions';

const INITIAL: PortalDefectFormState = {};

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'niedrig — kann warten' },
  { value: 'normal', label: 'normal' },
  { value: 'high', label: 'hoch — bitte zeitnah' },
  { value: 'emergency', label: 'Notfall — sofort erforderlich' },
];

// Bewusst als Vorschlaege via datalist, nicht als hartes Enum: Staff-Seite
// speichert Kategorie ebenfalls als Freitext (siehe (app)/defect-reports/
// report-form.tsx) — ein hartes Portal-Enum wuerde eine Kategorien-Divergenz
// zwischen Staff und Bewohner erzeugen. Reihenfolge nach Haeufigkeit im
// Wohnraum-Kontext.
const CATEGORY_SUGGESTIONS = [
  'Wasser / Sanitär',
  'Elektro',
  'Heizung',
  'Fenster / Türen',
  'Aufzug',
  'Reinigung / Müll',
  'Außenbereich / Garten',
  'Sonstiges',
];

const ATTACHMENT_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,text/plain,text/csv';

export function PortalDefectForm() {
  const [state, formAction, pending] = useActionState(createPortalDefectAction, INITIAL);
  const [file, setFile] = useState<File | null>(null);
  const [priority, setPriority] = useState<string>('normal');

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label="Titel"
        name="title"
        required
        placeholder="z. B. Wasserhahn im Bad tropft"
        error={state.fieldErrors?.['title']}
      />

      <Field
        label="Beschreibung"
        name="description"
        multiline
        rows={4}
        placeholder="Beschreiben Sie den Mangel so genau wie möglich."
        error={state.fieldErrors?.['description']}
      />

      <Field
        label="Wo genau? (optional)"
        name="location_details"
        placeholder="z. B. Bad, links unter dem Waschbecken"
        error={state.fieldErrors?.['location_details']}
      />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Kategorie (optional)</span>
        <input
          type="text"
          name="category"
          list="portal-defect-category-suggestions"
          placeholder="Auswählen oder eintippen …"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
        <datalist id="portal-defect-category-suggestions">
          {CATEGORY_SUGGESTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {state.fieldErrors?.category && (
          <span className="text-xs text-[var(--color-destructive)]">
            {state.fieldErrors.category}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Dringlichkeit</span>
        <select
          name="priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        >
          {PRIORITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {priority === 'emergency' && (
        <div
          role="alert"
          className="flex gap-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Bei akuter Gefahr sofort Notruf wählen.</p>
            <p className="mt-1">
              Diese Meldung ersetzt keinen Notruf. Bei Feuer, Wasserrohrbruch mit
              Gefahr für Personen, Gas­geruch oder medizinischen Notfällen zuerst
              Feuerwehr (112) oder den Notdienst rufen und die Hausverwaltung
              zusätzlich informieren.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Foto oder Datei (optional)</span>
        <label
          htmlFor="portal-defect-new-file"
          className="inline-flex cursor-pointer items-center gap-2 self-start rounded-md border border-dashed border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-muted)]"
        >
          <Paperclip className="h-4 w-4" aria-hidden />
          <span>{file ? file.name : 'Datei auswählen'}</span>
        </label>
        <input
          id="portal-defect-new-file"
          type="file"
          name="file"
          accept={ATTACHMENT_ACCEPT}
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <p className="text-xs text-[var(--color-muted-foreground)]">
          JPG/PNG/WebP/HEIC oder PDF/Text · max. 25 MB. EXIF-Daten werden vor
          dem Speichern entfernt. Sie können später weitere Anhänge auf der
          Meldungs-Detailseite hinzufügen.
        </p>
        {state.fieldErrors?.file && (
          <span className="text-xs text-[var(--color-destructive)]">
            {state.fieldErrors.file}
          </span>
        )}
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Sende …' : 'Meldung absenden'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  required,
  placeholder,
  multiline,
  rows,
  error,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  error?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-[var(--color-destructive)]"> *</span>}
      </span>
      {multiline ? (
        <textarea
          name={name}
          required={required}
          rows={rows ?? 3}
          placeholder={placeholder}
          className="resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
      ) : (
        <input
          type="text"
          name={name}
          required={required}
          placeholder={placeholder}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
      )}
      {error && <span className="text-xs text-[var(--color-destructive)]">{error}</span>}
    </label>
  );
}
