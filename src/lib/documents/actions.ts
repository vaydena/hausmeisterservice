'use server';

import { revalidatePath } from 'next/cache';
import sharp from 'sharp';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  DOC_ALLOWED_MIME,
  DOC_MAX_BYTES,
  buildStoragePath,
  documentUploadTargetSchema,
  inferKind,
  isImageMime,
  pickExtension,
  type DocumentEntityType,
} from '@/lib/schemas/documents';

const BUCKET = 'attachments';

function friendlyDbMessage(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für diese Aktion.';
  if (msg.includes('violates foreign key')) return 'Die zugehörige Entität existiert nicht (mehr).';
  if (msg.includes('duplicate key')) return 'Datei existiert bereits.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

type ResolvedTarget = {
  propertyId: string | null;
  revalidateHref: string;
};

/**
 * Ermittelt die property_id (für RLS-Scope) und den Pfad, der nach dem Upload
 * revalidiert werden muss. Prüft implizit über RLS, dass der User die Entität
 * überhaupt sehen darf — wenn maybeSingle() null liefert, brechen wir ab.
 */
async function resolveTarget(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  entityType: DocumentEntityType,
  entityId: string,
): Promise<ResolvedTarget> {
  switch (entityType) {
    case 'work_order': {
      const { data } = await supabase
        .from('work_orders')
        .select('property_id')
        .eq('id', entityId)
        .maybeSingle();
      if (!data) throw new Error('Auftrag nicht gefunden.');
      return { propertyId: data.property_id, revalidateHref: `/work-orders/${entityId}` };
    }
    case 'defect_report': {
      const { data } = await supabase
        .from('defect_reports')
        .select('property_id')
        .eq('id', entityId)
        .maybeSingle();
      if (!data) throw new Error('Meldung nicht gefunden.');
      return { propertyId: data.property_id, revalidateHref: `/defect-reports/${entityId}` };
    }
    case 'checklist_run_item': {
      const { data } = await supabase
        .from('checklist_run_items')
        .select('run_id, checklist_runs!inner(property_id, id)')
        .eq('id', entityId)
        .maybeSingle();
      if (!data) throw new Error('Prüfpunkt nicht gefunden.');
      const runId = (data as { run_id: string }).run_id;
      const propertyId = (data as { checklist_runs: { property_id: string | null } }).checklist_runs?.property_id ?? null;
      return { propertyId, revalidateHref: `/checklist-runs/${runId}` };
    }
    case 'property': {
      const { data } = await supabase
        .from('properties')
        .select('id')
        .eq('id', entityId)
        .maybeSingle();
      if (!data) throw new Error('Objekt nicht gefunden.');
      return { propertyId: entityId, revalidateHref: `/properties/${entityId}` };
    }
    case 'unit': {
      const { data } = await supabase
        .from('units')
        .select('buildings!inner(property_id)')
        .eq('id', entityId)
        .maybeSingle();
      if (!data) throw new Error('Einheit nicht gefunden.');
      const propertyId = (data as { buildings: { property_id: string } }).buildings?.property_id ?? null;
      return { propertyId, revalidateHref: `/properties/${propertyId ?? ''}` };
    }
  }
}

type ProcessedImage = {
  buffer: Buffer;
  mime: string;
  extension: string;
};

/**
 * EXIF/GPS entfernen. sharp strippt Metadata standardmäßig beim Re-Encode.
 * .rotate() ohne Argument wendet EXIF-Orientation an, sodass die Ausrichtung
 * korrekt bleibt, ohne die Metadata behalten zu müssen.
 * HEIC → JPEG (browsertauglich, EXIF weg).
 */
async function stripImageMetadata(buffer: Buffer, mime: string): Promise<ProcessedImage> {
  const img = sharp(buffer, { failOn: 'none' }).rotate();
  if (mime === 'image/png') {
    const out = await img.png().toBuffer();
    return { buffer: out, mime: 'image/png', extension: 'png' };
  }
  if (mime === 'image/webp') {
    const out = await img.webp({ quality: 88 }).toBuffer();
    return { buffer: out, mime: 'image/webp', extension: 'webp' };
  }
  const out = await img.jpeg({ quality: 88 }).toBuffer();
  return { buffer: out, mime: 'image/jpeg', extension: 'jpg' };
}

export async function uploadDocumentAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();

  const parsed = documentUploadTargetSchema.safeParse({
    entity_type: formData.get('entity_type'),
    entity_id: formData.get('entity_id'),
    caption: formData.get('caption') ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('Bitte eine Datei auswählen.');
  }
  if (file.size > DOC_MAX_BYTES) {
    throw new Error('Datei ist zu groß (max. 25 MB).');
  }
  if (!DOC_ALLOWED_MIME.includes(file.type)) {
    throw new Error('Dateityp wird nicht unterstützt.');
  }

  const supabase = await createSupabaseServerClient();
  const target = await resolveTarget(supabase, parsed.data.entity_type, parsed.data.entity_id);

  let buffer: Buffer = Buffer.from(await file.arrayBuffer());
  let effectiveMime = file.type;
  let effectiveExt = pickExtension(file.name, file.type);

  if (isImageMime(file.type)) {
    const processed = await stripImageMetadata(buffer, file.type);
    buffer = processed.buffer;
    effectiveMime = processed.mime;
    effectiveExt = processed.extension;
  }

  const documentId = crypto.randomUUID();
  const storagePath = buildStoragePath({
    tenantId: ctx.tenantId,
    entityType: parsed.data.entity_type,
    entityId: parsed.data.entity_id,
    documentId,
    ext: effectiveExt,
  });

  const uploadBlob = new Blob([new Uint8Array(buffer)], { type: effectiveMime });
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, uploadBlob, {
      contentType: effectiveMime,
      upsert: false,
    });
  if (uploadErr) throw new Error(friendlyDbMessage(uploadErr.message));

  const { error: insertErr } = await supabase.from('documents').insert({
    id: documentId,
    tenant_id: ctx.tenantId,
    entity_type: parsed.data.entity_type,
    entity_id: parsed.data.entity_id,
    property_id: target.propertyId,
    kind: inferKind(effectiveMime),
    storage_path: storagePath,
    original_filename: file.name.slice(0, 255),
    mime_type: effectiveMime,
    byte_size: uploadBlob.size,
    caption: parsed.data.caption,
    uploaded_by: ctx.userId,
  });

  if (insertErr) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(friendlyDbMessage(insertErr.message));
  }

  revalidatePath(target.revalidateHref);
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const documentId = String(formData.get('document_id') ?? '');
  if (!documentId) throw new Error('Dokument fehlt.');

  const supabase = await createSupabaseServerClient();

  const { data: doc, error: fetchErr } = await supabase
    .from('documents')
    .select('storage_path, entity_type, entity_id')
    .eq('id', documentId)
    .maybeSingle();
  if (fetchErr) throw new Error(friendlyDbMessage(fetchErr.message));
  if (!doc) throw new Error('Dokument nicht gefunden oder keine Berechtigung.');

  const { error: dbErr } = await supabase.from('documents').delete().eq('id', documentId);
  if (dbErr) throw new Error(friendlyDbMessage(dbErr.message));

  await supabase.storage.from(BUCKET).remove([doc.storage_path]);

  const target = await resolveTarget(
    supabase,
    doc.entity_type as DocumentEntityType,
    doc.entity_id,
  ).catch(() => null);
  if (target) revalidatePath(target.revalidateHref);
}

/**
 * Signed URL für privaten Download. Wird von Server Components aufgerufen,
 * damit Bilder direkt im <img src=...>-Attribut geladen werden können.
 * Storage-RLS erzwingt Tenant-Match, die documents-SELECT-Policy zusätzlich
 * die permission-basierte Sichtbarkeit.
 */
export async function createSignedDocumentUrl(
  storagePath: string,
  ttlSeconds = 3600,
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, ttlSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
