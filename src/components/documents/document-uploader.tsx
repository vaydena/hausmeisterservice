'use client';

import { useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import {
  DOC_ALLOWED_MIME,
  DOC_MAX_BYTES,
  formatBytes,
  type DocumentEntityType,
} from '@/lib/schemas/documents';
import { uploadDocumentAction } from '@/lib/documents/actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Wird hochgeladen…' : label}
    </Button>
  );
}

export function DocumentUploader({
  entityType,
  entityId,
  accept,
  label = 'Datei hochladen',
  compact = false,
}: {
  entityType: DocumentEntityType;
  entityId: string;
  /** Wenn gesetzt, filtert der Datei-Picker (z. B. 'image/*'). */
  accept?: string;
  label?: string;
  compact?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [pickedSize, setPickedSize] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setPickedName(null);
      setPickedSize(null);
      return;
    }
    if (file.size > DOC_MAX_BYTES) {
      setError(`Datei ist zu groß (${formatBytes(file.size)}). Max. 25 MB.`);
      e.target.value = '';
      setPickedName(null);
      setPickedSize(null);
      return;
    }
    if (file.type && !DOC_ALLOWED_MIME.includes(file.type)) {
      setError('Dateityp wird nicht unterstützt.');
      e.target.value = '';
      setPickedName(null);
      setPickedSize(null);
      return;
    }
    setPickedName(file.name);
    setPickedSize(file.size);
  }

  async function handleAction(formData: FormData) {
    try {
      await uploadDocumentAction(formData);
      formRef.current?.reset();
      setPickedName(null);
      setPickedSize(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen.');
    }
  }

  return (
    <form ref={formRef} action={handleAction} className="flex flex-col gap-2">
      <input type="hidden" name="entity_type" value={entityType} />
      <input type="hidden" name="entity_id" value={entityId} />
      <div className={compact ? 'flex flex-col gap-2 sm:flex-row sm:items-end' : 'flex flex-col gap-3'}>
        <Field label={label} htmlFor={`file-${entityId}`}>
          <Input
            id={`file-${entityId}`}
            type="file"
            name="file"
            accept={accept}
            onChange={onFileChange}
            required
          />
        </Field>
        {!compact && (
          <Field label="Beschreibung" htmlFor={`caption-${entityId}`} optional>
            <Input id={`caption-${entityId}`} type="text" name="caption" maxLength={500} />
          </Field>
        )}
        <div className={compact ? '' : 'flex justify-end'}>
          <SubmitButton label="Hochladen" />
        </div>
      </div>
      {pickedName && (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Ausgewählt: {pickedName}
          {pickedSize !== null ? ` (${formatBytes(pickedSize)})` : ''}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-[var(--color-destructive)]">
          {error}
        </p>
      )}
    </form>
  );
}
