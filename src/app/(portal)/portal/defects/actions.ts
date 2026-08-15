'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import sharp from 'sharp';
import { z } from 'zod';
import { requireResidentContext } from '@/lib/portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import {
  DOC_ALLOWED_MIME,
  DOC_MAX_BYTES,
  buildStoragePath,
  inferKind,
  isImageMime,
  pickExtension,
} from '@/lib/schemas/documents';

const PRIORITIES = ['low', 'normal', 'high', 'emergency'] as const;

const withdrawSchema = z.object({
  id: z.string().uuid('Ungültige Meldungs-ID.'),
});

const uploadDocSchema = z.object({
  defect_id: z.string().uuid('Ungültige Meldungs-ID.'),
  caption: z
    .string()
    .trim()
    .max(500, 'Bildunterschrift darf maximal 500 Zeichen lang sein.')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

const ATTACHMENTS_BUCKET = 'attachments';

const defectSchema = z.object({
  title: z.string().trim().min(3, 'Bitte einen aussagekräftigen Titel angeben.').max(200),
  description: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  location_details: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  priority: z.enum(PRIORITIES).default('normal'),
  category: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type PortalDefectFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function friendly(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für diese Aktion.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

export async function createPortalDefectAction(
  _prev: PortalDefectFormState,
  formData: FormData,
): Promise<PortalDefectFormState> {
  const ctx = await requireResidentContext();

  const parsed = defectSchema.safeParse({
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? undefined,
    location_details: formData.get('location_details') ?? undefined,
    priority: formData.get('priority') ?? 'normal',
    category: formData.get('category') ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: 'Bitte prüfen Sie die Eingaben.' };
  }

  // Sprint 57: optionale Datei aus dem selben Formular — pre-flight validieren,
  // bevor die Meldung angelegt wird. So bekommt der User einen sauberen
  // Fehler, statt einer bereits erstellten Meldung ohne Anhang plus
  // Fehler-Banner (halbfertiger Zustand nervt mehr als Frust am Formular).
  const file = formData.get('file');
  let attachment: File | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > DOC_MAX_BYTES) {
      return {
        error: 'Anhang ist zu groß.',
        fieldErrors: { file: 'Datei ist zu groß (max. 25 MB).' },
      };
    }
    if (!DOC_ALLOWED_MIME.includes(file.type)) {
      return {
        error: 'Anhang-Format nicht erlaubt.',
        fieldErrors: { file: 'Dateityp wird nicht unterstützt.' },
      };
    }
    attachment = file;
  }

  const supabase = await createSupabaseServerClient();
  const inserted = await supabase
    .from('defect_reports')
    .insert({
      tenant_id: ctx.tenantId,
      property_id: ctx.propertyId,
      building_id: ctx.buildingId,
      unit_id: ctx.unitId,
      title: parsed.data.title,
      description: parsed.data.description,
      location_details: parsed.data.location_details,
      priority: parsed.data.priority,
      category: parsed.data.category,
      reporter_kind: 'resident',
      reporter_user_id: ctx.userId,
      reporter_name: ctx.displayName,
      reporter_contact: ctx.email,
      code: '',
    })
    .select('id, property_id')
    .single();

  if (inserted.error || !inserted.data) {
    return { error: friendly(inserted.error?.message) };
  }

  let redirectInfo: string | null = null;
  if (attachment) {
    try {
      await uploadDefectAttachment({
        supabase,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        defectId: inserted.data.id,
        propertyId: inserted.data.property_id,
        file: attachment,
        caption: null,
      });
    } catch {
      // Meldung existiert bereits, Anhang schlug fehl — der Bewohner soll auf
      // der Detail-Seite nachreichen koennen. Der Detail-Route zeigt via
      // ?info=upload-failed einen Warn-Banner.
      redirectInfo = 'upload-failed';
    }
  }

  revalidatePath('/portal/defects');
  revalidatePath('/portal/dashboard');
  redirect(
    `/portal/defects/${inserted.data.id}${redirectInfo ? `?info=${redirectInfo}` : ''}`,
  );
}

/**
 * Sprint 52: Bewohner zieht eine eigene Meldung zurueck, solange die
 * Hausverwaltung sie noch nicht in Bearbeitung genommen hat (status='new').
 * Sobald der Status auf 'reviewing', 'converted' oder 'rejected' gewechselt
 * ist, gibt es typischerweise bereits eine Reaktion oder einen daraus
 * abgeleiteten Vorgang (Work-Order via converted_work_order_id), der nicht
 * durch einen einseitigen Bewohner-Rueckzug abgewickelt werden darf.
 *
 * Hard-DELETE ist semantisch bewusst gewaehlt: eine zurueckgezogene Meldung
 * war (aus Sicht der Verwaltung, die noch nichts damit gemacht hat) nie
 * relevant. Es gibt keine FK-Kinder auf defect_reports und keinen Audit-
 * Trigger auf der Tabelle (Sprint 30 hat Audit nur auf sensiblen Auth/
 * Membership-Tabellen aktiviert), also entstehen keine verwaisten Refs.
 * Automatisierungen (defect_report.created) haben ggf. schon gefeuert;
 * der zurueckgezogene Zustand invalidiert die Notification nicht rueckwirkend,
 * aber das ist gewuenscht — die Verwaltung hat evtl. schon reagiert und
 * kommuniziert das dann direkt mit dem Bewohner ueber /portal/messages.
 *
 * Die Guards laufen als Query-Filter (reporter_user_id + status='new') statt
 * als separate SELECT-check-DELETE-Sequenz: RLS auf defect_reports erlaubt
 * dem Bewohner ohnehin nur seine eigenen Rows (portal_reader_select-Policy),
 * und der WHERE-Filter macht daraus ein atomares "no-op wenn Voraussetzung
 * fehlt". count-Rueckgabe zeigt an, ob wirklich geloescht wurde.
 */
export async function withdrawPortalDefectAction(formData: FormData): Promise<void> {
  const ctx = await requireResidentContext();
  const parsed = withdrawSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Meldungs-ID.');
  }

  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('defect_reports')
    .delete({ count: 'exact' })
    .eq('id', parsed.data.id)
    .eq('reporter_user_id', ctx.userId)
    .eq('status', 'new');

  if (error) {
    throw new Error('Zurückziehen fehlgeschlagen. Bitte erneut versuchen.');
  }
  if (!count) {
    throw new Error(
      'Diese Meldung kann nicht mehr zurückgezogen werden. Sie wurde bereits bearbeitet.',
    );
  }

  revalidatePath('/portal/defects');
  revalidatePath('/portal/dashboard');
  redirect('/portal/defects?info=withdrawn');
}

/**
 * Interner Helper: Foto/Datei an eine bestehende defect_report anhaengen.
 * Enthaelt Ownership-Guard-Vertrauensbereich: der Aufrufer MUSS defectId +
 * propertyId aus einer bereits RLS-gefilterten Query holen (createPortal-
 * DefectAction hat gerade selbst inserted, uploadPortalDefectDocumentAction
 * macht davor einen reporter_user_id-Match). Fehler werfen throw — Aufrufer
 * entscheidet, ob als form-error zurueckgegeben oder als Redirect-Query.
 *
 * EXIF/GPS wird bei Bildern durch sharp re-encode entfernt (analog zum Staff-
 * Pfad in @/lib/documents/actions.ts). HEIC/HEIF → JPEG, damit Browser sie
 * direkt anzeigen koennen. Kein Rollback bei documents-Insert-Fehler auf den
 * Storage-Blob mehr — der Storage-Upload wird explizit revert (remove).
 */
async function uploadDefectAttachment(params: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  tenantId: string;
  userId: string;
  defectId: string;
  propertyId: string | null;
  file: File;
  caption: string | null;
}): Promise<void> {
  const { supabase, tenantId, userId, defectId, propertyId, file, caption } = params;

  let buffer: Buffer = Buffer.from(await file.arrayBuffer());
  let effectiveMime = file.type;
  let effectiveExt = pickExtension(file.name, file.type);

  if (isImageMime(file.type)) {
    const img = sharp(buffer, { failOn: 'none' }).rotate();
    if (file.type === 'image/png') {
      buffer = await img.png().toBuffer();
      effectiveMime = 'image/png';
      effectiveExt = 'png';
    } else if (file.type === 'image/webp') {
      buffer = await img.webp({ quality: 88 }).toBuffer();
      effectiveMime = 'image/webp';
      effectiveExt = 'webp';
    } else {
      buffer = await img.jpeg({ quality: 88 }).toBuffer();
      effectiveMime = 'image/jpeg';
      effectiveExt = 'jpg';
    }
  }

  const documentId = crypto.randomUUID();
  const storagePath = buildStoragePath({
    tenantId,
    entityType: 'defect_report',
    entityId: defectId,
    documentId,
    ext: effectiveExt,
  });

  const uploadBlob = new Blob([new Uint8Array(buffer)], { type: effectiveMime });
  const { error: uploadErr } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(storagePath, uploadBlob, { contentType: effectiveMime, upsert: false });
  if (uploadErr) {
    throw new Error('Upload fehlgeschlagen. Bitte erneut versuchen.');
  }

  const { error: insertErr } = await supabase.from('documents').insert({
    id: documentId,
    tenant_id: tenantId,
    entity_type: 'defect_report',
    entity_id: defectId,
    property_id: propertyId,
    kind: inferKind(effectiveMime),
    storage_path: storagePath,
    original_filename: file.name.slice(0, 255),
    mime_type: effectiveMime,
    byte_size: uploadBlob.size,
    caption,
    uploaded_by: userId,
  });

  if (insertErr) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]);
    throw new Error('Speichern fehlgeschlagen. Bitte erneut versuchen.');
  }
}

/**
 * Sprint 56: Portal-Bewohner haengt Foto oder Datei an eine eigene Meldung an.
 * Ownership-Guard laeuft implizit ueber die documents_insert_resident_own_defect
 * RLS-Policy (WHERE dr.reporter_user_id = auth.uid()); wir laden hier
 * property_id via defect_reports-Select, der ebenfalls RLS-gefiltert ist. Wenn
 * die defect_report nicht dem Bewohner gehoert, sieht er sie nicht → early
 * error mit Rollback.
 */
export async function uploadPortalDefectDocumentAction(formData: FormData): Promise<void> {
  const ctx = await requireResidentContext();

  const parsed = uploadDocSchema.safeParse({
    defect_id: formData.get('defect_id'),
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

  const defect = unwrapMaybeRow(
    await supabase
      .from('defect_reports')
      .select('id, property_id')
      .eq('id', parsed.data.defect_id)
      .eq('reporter_user_id', ctx.userId)
      .maybeSingle(),
    'Portal: Meldung zum Foto-Upload',
  );

  if (!defect) {
    throw new Error('Meldung nicht gefunden.');
  }

  await uploadDefectAttachment({
    supabase,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    defectId: defect.id,
    propertyId: defect.property_id,
    file,
    caption: parsed.data.caption,
  });

  revalidatePath(`/portal/defects/${parsed.data.defect_id}`);
}
