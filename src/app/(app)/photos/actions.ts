'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { stripImageMetadata } from '@/lib/images/strip-metadata';
import { DOC_BUCKET, pickExtension } from '@/lib/schemas/documents';
import {
  PHOTO_ALLOWED_MIME,
  PHOTO_MAX_BYTES,
  buildPhotoStoragePath,
  photoUploadTargetSchema,
} from '@/lib/schemas/photos';

export type PhotoUploadState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function fieldErrorsFromZod(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

function friendlyDbMessage(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für dieses Objekt.';
  if (msg.includes('violates foreign key')) return 'Das gewählte Objekt oder der Auftrag existiert nicht (mehr).';
  if (msg.includes('duplicate key')) return 'Dieses Bild wurde bereits hochgeladen.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

export async function uploadPhotosAction(
  _prev: PhotoUploadState,
  formData: FormData,
): Promise<PhotoUploadState> {
  const ctx = await requireTenantContext();

  const parsed = photoUploadTargetSchema.safeParse({
    property_id: formData.get('property_id') ?? '',
    work_order_id: formData.get('work_order_id') ?? undefined,
    phase: formData.get('phase') ?? 'general',
    caption: formData.get('caption') ?? undefined,
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), error: 'Bitte prüfen Sie die Eingaben.' };
  }

  const files = formData
    .getAll('files')
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return { fieldErrors: { files: 'Bitte mindestens ein Bild wählen.' }, error: 'Kein Bild ausgewählt.' };
  }

  for (const file of files) {
    if (file.size > PHOTO_MAX_BYTES) {
      return { error: `„${file.name}" ist zu groß (max. 25 MB).` };
    }
    if (!PHOTO_ALLOWED_MIME.includes(file.type)) {
      return { error: `„${file.name}" ist kein unterstütztes Bildformat (JPEG, PNG, WebP, HEIC).` };
    }
  }

  const supabase = await createSupabaseServerClient();
  let uploaded = 0;

  for (const file of files) {
    let buffer: Buffer = Buffer.from(await file.arrayBuffer());
    let mime = file.type;
    let ext = pickExtension(file.name, file.type);

    // EXIF-Entfernung ist Pflicht — Fotos vom Objekt tragen sonst den
    // Aufnahmeort im Bild. Scheitert die Pipeline, laden wir NICHT das
    // Original hoch, sondern melden es.
    try {
      const processed = await stripImageMetadata(buffer, file.type);
      buffer = processed.buffer;
      mime = processed.mime;
      ext = processed.extension;
    } catch {
      return {
        error:
          uploaded > 0
            ? `${uploaded} Foto(s) gespeichert. „${file.name}" konnte nicht verarbeitet werden.`
            : `„${file.name}" konnte nicht verarbeitet werden. Bitte anderes Bild versuchen.`,
      };
    }

    const photoId = crypto.randomUUID();
    const storagePath = buildPhotoStoragePath({
      tenantId: ctx.tenantId,
      propertyId: parsed.data.property_id,
      photoId,
      ext,
    });

    const blob = new Blob([new Uint8Array(buffer)], { type: mime });
    const { error: upErr } = await supabase.storage
      .from(DOC_BUCKET)
      .upload(storagePath, blob, { contentType: mime, upsert: false });
    if (upErr) {
      return {
        error: `${uploaded > 0 ? `${uploaded} gespeichert. ` : ''}${friendlyDbMessage(upErr.message)}`,
      };
    }

    const { error: insErr } = await supabase.from('photos').insert({
      id: photoId,
      tenant_id: ctx.tenantId,
      property_id: parsed.data.property_id,
      work_order_id: parsed.data.work_order_id,
      phase: parsed.data.phase,
      storage_path: storagePath,
      mime_type: mime,
      byte_size: blob.size,
      caption: parsed.data.caption,
      uploaded_by: ctx.userId,
    });
    if (insErr) {
      await supabase.storage.from(DOC_BUCKET).remove([storagePath]);
      return {
        error: `${uploaded > 0 ? `${uploaded} gespeichert. ` : ''}${friendlyDbMessage(insErr.message)}`,
      };
    }
    uploaded++;
  }

  revalidatePath('/photos');
  redirect(`/photos?property_id=${parsed.data.property_id}`);
}

export async function deletePhotoAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const photoId = String(formData.get('photo_id') ?? '');
  if (!photoId) throw new Error('Foto fehlt.');

  const supabase = await createSupabaseServerClient();

  const { data: photo, error: fetchErr } = await supabase
    .from('photos')
    .select('storage_path')
    .eq('id', photoId)
    .maybeSingle();
  if (fetchErr) throw new Error(friendlyDbMessage(fetchErr.message));
  if (!photo) throw new Error('Foto nicht gefunden oder keine Berechtigung.');

  const { error: dbErr } = await supabase.from('photos').delete().eq('id', photoId);
  if (dbErr) throw new Error(friendlyDbMessage(dbErr.message));

  await supabase.storage.from(DOC_BUCKET).remove([photo.storage_path]);

  revalidatePath('/photos');
}
