'use client';

import { useRef, useState, useTransition, type FormEvent } from 'react';
import { Paperclip } from 'lucide-react';
import { uploadPortalDefectDocumentAction } from '../actions';

const ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,text/plain,text/csv';

export function PortalDefectUploadForm({ defectId }: { defectId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError('Bitte eine Datei auswählen.');
      return;
    }
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await uploadPortalDefectDocumentAction(formData);
        formRef.current?.reset();
        setFile(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen.');
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="defect_id" value={defectId} />
      <div>
        <label
          htmlFor="portal-defect-file"
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-muted)]"
        >
          <Paperclip className="h-4 w-4" aria-hidden />
          <span>{file ? file.name : 'Datei auswählen'}</span>
        </label>
        <input
          id="portal-defect-file"
          type="file"
          name="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          Fotos (JPG, PNG, WebP, HEIC) oder PDF/Text · max. 25 MB. EXIF-Daten
          werden vor dem Speichern entfernt.
        </p>
      </div>

      <input
        type="text"
        name="caption"
        placeholder="Bildunterschrift (optional)"
        maxLength={500}
        disabled={pending}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
      />

      {error && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || !file}
          className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Wird hochgeladen …' : 'Hochladen'}
        </button>
      </div>
    </form>
  );
}
