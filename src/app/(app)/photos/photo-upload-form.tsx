'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea, Select, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PHOTO_PHASES, PHOTO_PHASE_LABEL } from '@/lib/schemas/photos';
import { uploadPhotosAction, type PhotoUploadState } from './actions';

const INITIAL: PhotoUploadState = {};

type PropertyOption = { id: string; name: string; code: string | null };
type WorkOrderOption = { id: string; property_id: string; label: string };
type LocalPreview = { name: string; url: string };

export function PhotoUploadForm({
  properties,
  workOrders,
  defaultPropertyId,
}: {
  properties: PropertyOption[];
  workOrders: WorkOrderOption[];
  defaultPropertyId?: string;
}) {
  const [state, formAction, pending] = useActionState(uploadPhotosAction, INITIAL);
  const err = state.fieldErrors ?? {};

  const [propertyId, setPropertyId] = useState<string>(defaultPropertyId ?? '');
  const [previews, setPreviews] = useState<LocalPreview[]>([]);

  const filteredWorkOrders = useMemo(
    () => workOrders.filter((w) => w.property_id === propertyId),
    [workOrders, propertyId],
  );

  function onFilesChange(fileList: FileList | null) {
    // Alte Objekt-URLs freigeben, bevor neue entstehen.
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    if (!fileList) {
      setPreviews([]);
      return;
    }
    const next: LocalPreview[] = Array.from(fileList)
      .filter((f) => f.type.startsWith('image/'))
      .map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));
    setPreviews(next);
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Fotos hochladen</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Objekt" htmlFor="property_id" error={err['property_id']}>
                <Select
                  id="property_id"
                  name="property_id"
                  required
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                >
                  <option value="" disabled>
                    Objekt wählen …
                  </option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code ? `${p.code} · ${p.name}` : p.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Phase" htmlFor="phase" error={err['phase']}>
                <Select id="phase" name="phase" defaultValue="general">
                  {PHOTO_PHASES.map((ph) => (
                    <option key={ph} value={ph}>
                      {PHOTO_PHASE_LABEL[ph]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              label="Auftrag"
              htmlFor="work_order_id"
              optional
              error={err['work_order_id']}
              hint={
                propertyId && filteredWorkOrders.length === 0
                  ? 'Für dieses Objekt gibt es keine offenen Aufträge.'
                  : 'Foto einem Auftrag zuordnen'
              }
            >
              <Select
                id="work_order_id"
                name="work_order_id"
                defaultValue=""
                disabled={filteredWorkOrders.length === 0}
              >
                <option value="">Ohne Auftrag</option>
                {filteredWorkOrders.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Bildunterschrift" htmlFor="caption" optional error={err['caption']}>
              <Textarea
                id="caption"
                name="caption"
                rows={2}
                placeholder="Gilt für alle hier hochgeladenen Fotos – z. B. Treppenhaus 2. OG, Wasserschaden"
              />
            </Field>

            <Field
              label="Bilder"
              htmlFor="files"
              error={err['files']}
              hint="JPEG, PNG, WebP oder HEIC · mehrere möglich · max. 25 MB je Bild"
            >
              <input
                id="files"
                name="files"
                type="file"
                accept="image/*"
                multiple
                required
                onChange={(e) => onFilesChange(e.target.files)}
                className="block w-full text-sm text-[var(--color-muted-foreground)] file:mr-4 file:rounded-md file:border-0 file:bg-[var(--color-muted)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--color-foreground)] hover:file:opacity-80"
              />
            </Field>

            {previews.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {previews.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p.url}
                    src={p.url}
                    alt={p.name}
                    className="aspect-square w-full rounded-md object-cover"
                  />
                ))}
              </div>
            )}
          </div>
        </CardBody>
        <CardFooter>
          {state.error && (
            <p role="alert" className="mr-auto text-sm text-[var(--color-destructive)]">
              {state.error}
            </p>
          )}
          <Link
            href="/photos"
            className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            Abbrechen
          </Link>
          <Button type="submit" disabled={pending}>
            {pending ? 'Wird hochgeladen …' : 'Hochladen'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
