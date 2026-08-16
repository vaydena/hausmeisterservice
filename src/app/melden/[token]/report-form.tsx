'use client';

import { useActionState, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2 } from 'lucide-react';
import { CharCounter } from '@/components/ui/char-counter';
import {
  PUBLIC_DEFECT_CATEGORIES,
  REPORTER_ROLES,
  REPORTER_ROLE_LABEL,
} from '@/lib/schemas/report-links';
import {
  attachPublicReportPhotoAction,
  submitPublicReportAction,
  type PublicReportFormState,
} from './actions';

const INITIAL: PublicReportFormState = {};

const TITLE_MAX = 150;
const DESCRIPTION_MAX = 2000;
const SHORT_MAX = 200;
const NAME_MAX = 120;

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'niedrig — kann warten' },
  { value: 'normal', label: 'normal' },
  { value: 'high', label: 'hoch — bitte zeitnah' },
  { value: 'emergency', label: 'Notfall — sofort erforderlich' },
];

const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

const FIELD_CLASS =
  'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-base outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 sm:text-sm';

export function PublicReportForm({
  token,
  tenantName,
}: {
  token: string;
  tenantName: string;
}) {
  const [state, formAction, pending] = useActionState(submitPublicReportAction, INITIAL);
  const [priority, setPriority] = useState('normal');
  const [file, setFile] = useState<File | null>(null);
  const [descriptionLength, setDescriptionLength] = useState(0);

  if (state.ok) {
    return <SubmittedPanel token={token} state={state} tenantName={tenantName} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">
          Worum geht es? <span className="text-[var(--color-destructive)]">*</span>
        </span>
        <input
          type="text"
          name="title"
          required
          maxLength={TITLE_MAX}
          placeholder="z. B. Aufzug steht seit heute früh"
          className={FIELD_CLASS}
        />
        {state.fieldErrors?.title && (
          <span className="text-xs text-[var(--color-destructive)]">
            {state.fieldErrors.title}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Beschreibung</span>
        <textarea
          name="description"
          rows={4}
          maxLength={DESCRIPTION_MAX}
          onChange={(e) => setDescriptionLength(e.target.value.length)}
          placeholder="Seit wann besteht das Problem? Was genau ist zu sehen oder zu hören?"
          className={`${FIELD_CLASS} resize-y`}
        />
        <span className="flex items-center justify-between gap-2">
          {state.fieldErrors?.description ? (
            <span className="text-xs text-[var(--color-destructive)]">
              {state.fieldErrors.description}
            </span>
          ) : (
            <span aria-hidden />
          )}
          <CharCounter length={descriptionLength} max={DESCRIPTION_MAX} />
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Wo genau?</span>
        <input
          type="text"
          name="location_details"
          maxLength={SHORT_MAX}
          placeholder="z. B. Treppenhaus B, zwischen 2. und 3. Stock"
          className={FIELD_CLASS}
        />
        {state.fieldErrors?.location_details && (
          <span className="text-xs text-[var(--color-destructive)]">
            {state.fieldErrors.location_details}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Kategorie</span>
        <input
          type="text"
          name="category"
          list="public-report-categories"
          placeholder="Auswählen oder eintippen …"
          className={FIELD_CLASS}
        />
        <datalist id="public-report-categories">
          {PUBLIC_DEFECT_CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Dringlichkeit</span>
        <select
          name="priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className={FIELD_CLASS}
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
            <p className="font-medium">Bei akuter Gefahr zuerst den Notruf wählen.</p>
            <p className="mt-1">
              Diese Meldung ersetzt keinen Notruf. Bei Feuer, Gasgeruch,
              Wasserrohrbruch mit Gefahr für Personen oder einem medizinischen
              Notfall zuerst 112 rufen — und {tenantName} zusätzlich informieren.
            </p>
          </div>
        </div>
      )}

      <fieldset className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] p-4">
        <legend className="px-1 text-sm font-medium">Ihre Angaben</legend>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm">Sie melden als</span>
          <select name="reporter_role" defaultValue="owner" className={FIELD_CLASS}>
            {REPORTER_ROLES.map((role) => (
              <option key={role} value={role}>
                {REPORTER_ROLE_LABEL[role]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm">Name</span>
          <input
            type="text"
            name="reporter_name"
            maxLength={NAME_MAX}
            autoComplete="name"
            placeholder="optional"
            className={FIELD_CLASS}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm">Telefon oder E-Mail</span>
          <input
            type="text"
            name="reporter_contact"
            maxLength={SHORT_MAX}
            autoComplete="email"
            placeholder="optional"
            className={FIELD_CLASS}
          />
          <span className="text-xs text-[var(--color-muted-foreground)]">
            Ohne Kontaktangabe kann {tenantName} keine Rückfragen stellen und Sie
            nicht über den Fortschritt informieren. Die Meldung wird trotzdem
            bearbeitet.
          </span>
        </label>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Foto</span>
        <label
          htmlFor="public-report-file"
          className="inline-flex cursor-pointer items-center gap-2 self-start rounded-md border border-dashed border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-muted)]"
        >
          <Camera className="h-4 w-4" aria-hidden />
          <span>{file ? file.name : 'Foto aufnehmen oder auswählen'}</span>
        </label>
        <input
          id="public-report-file"
          type="file"
          name="file"
          accept={PHOTO_ACCEPT}
          capture="environment"
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <span className="text-xs text-[var(--color-muted-foreground)]">
          JPG, PNG, WebP oder HEIC · max. 10 MB. Standortdaten im Bild werden vor
          dem Speichern entfernt.
        </span>
        {state.fieldErrors?.file && (
          <span className="text-xs text-[var(--color-destructive)]">
            {state.fieldErrors.file}
          </span>
        )}
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-md border border-[var(--color-destructive)]/40 bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] p-3 text-sm text-[var(--color-destructive)]"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 items-center justify-center rounded-md bg-[var(--color-primary)] px-4 text-base font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Wird gesendet …' : 'Meldung absenden'}
      </button>
    </form>
  );
}

/**
 * Nach dem Absenden bleibt der Melder auf derselben Seite. Ein Redirect
 * waere hier falsch: der Bestaetigungscode ist das einzige, was er
 * mitnehmen kann — er hat kein Konto, in dem er die Meldung wiederfindet.
 */
function SubmittedPanel({
  token,
  state,
  tenantName,
}: {
  token: string;
  state: PublicReportFormState;
  tenantName: string;
}) {
  const [attachState, attachAction, attachPending] = useActionState(
    attachPublicReportPhotoAction,
    INITIAL,
  );
  const [file, setFile] = useState<File | null>(null);
  const photoMissing = state.attachmentFailed && !attachState.ok && !!state.defectId;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div className="text-sm">
          <p className="font-medium">Ihre Meldung ist angekommen.</p>
          <p className="mt-1">
            {tenantName} sieht sie ab sofort in der Übersicht offener Meldungen.
          </p>
          {state.code && (
            <p className="mt-3">
              Ihre Vorgangsnummer:{' '}
              <span className="font-mono font-semibold">{state.code}</span>
              <br />
              <span className="text-xs">
                Notieren Sie sie, falls Sie zu dieser Meldung nachfragen möchten.
              </span>
            </p>
          )}
        </div>
      </div>

      {photoMissing && (
        <form action={attachAction} className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="defect_id" value={state.defectId ?? ''} />
          <p className="text-sm font-medium">Das Foto konnte nicht gespeichert werden.</p>
          <p className="text-sm">
            Die Meldung selbst ist da — bitte senden Sie sie nicht noch einmal.
            Das Foto können Sie hier nachreichen.
          </p>
          <label
            htmlFor="public-report-retry-file"
            className="inline-flex cursor-pointer items-center gap-2 self-start rounded-md border border-dashed border-current px-3 py-2 text-sm"
          >
            <Camera className="h-4 w-4" aria-hidden />
            <span>{file ? file.name : 'Foto auswählen'}</span>
          </label>
          <input
            id="public-report-retry-file"
            type="file"
            name="file"
            accept={PHOTO_ACCEPT}
            capture="environment"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {attachState.error && (
            <p role="alert" className="text-sm font-medium">
              {attachState.error}
            </p>
          )}
          <button
            type="submit"
            disabled={attachPending || !file}
            className="inline-flex h-10 items-center justify-center self-start rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {attachPending ? 'Wird gesendet …' : 'Foto nachreichen'}
          </button>
        </form>
      )}

      {attachState.ok && (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          Das Foto wurde an die Meldung angehängt.
        </p>
      )}

      <p className="text-sm text-[var(--color-muted-foreground)]">
        Sie können diese Seite jetzt schließen. Für eine weitere Meldung scannen
        Sie den Code einfach erneut.
      </p>
    </div>
  );
}
