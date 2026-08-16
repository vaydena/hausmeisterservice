'use server';

import { headers } from 'next/headers';
import * as Sentry from '@sentry/nextjs';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getClientIp } from '@/lib/security/client-ip';
import { checkAuthRateLimit, formatRateLimitError } from '@/lib/security/rate-limit';
import { resolveReportLink } from '@/lib/report-links/resolve';
import { isValidReportToken } from '@/lib/report-links/token';
import { publicDefectReportSchema } from '@/lib/schemas/report-links';
import { stripImageMetadata } from '@/lib/images/strip-metadata';
import { DOC_BUCKET, buildStoragePath, isImageMime } from '@/lib/schemas/documents';

/**
 * Sprint 124 · Anonymer Foto-Anhang: engere Grenzen als im angemeldeten Pfad.
 *
 * NUR Bilder, und nur die vier, die `sharp` sicher neu kodieren kann. Der
 * Staff-Pfad erlaubt zusaetzlich PDF, Office-Dokumente und CSV — dort haengt
 * am Upload ein Konto, eine Rolle und ein Audit-Trail. Hier haengt daran
 * niemand. Ein beliebiger Dateityp von einem unbekannten Absender ist eine
 * Ablage mit Fremdinhalt im Mandanten-Bucket, und der Betrieb waere derjenige,
 * der dafuer geradesteht.
 *
 * Das Re-Encode durch sharp ist deshalb nicht nur EXIF-Entfernung: es ist der
 * Beweis, dass die Datei wirklich ein Bild ist. Was sharp nicht dekodieren
 * kann, wird abgelehnt statt gespeichert.
 *
 * 10 MB statt 25: ein Handyfoto liegt bei 2–5 MB. Der Rest waere Puffer fuer
 * jemanden, der den Endpunkt als Speicherplatz benutzt.
 */
const PUBLIC_UPLOAD_MAX_BYTES = 10_485_760;
const PUBLIC_UPLOAD_MIME: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

export type PublicReportFormState = {
  ok?: boolean;
  code?: string;
  /** Nur fuer das Nachreichen eines Fotos aus der Bestaetigungsansicht. */
  defectId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** true = Meldung ist da, nur der Anhang blieb liegen. */
  attachmentFailed?: boolean;
};

const GENERIC_ERROR =
  'Die Meldung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.';

export async function submitPublicReportAction(
  _prev: PublicReportFormState,
  formData: FormData,
): Promise<PublicReportFormState> {
  const token = formData.get('token');
  if (!isValidReportToken(token)) {
    return { error: 'Dieser Melde-Link ist nicht gültig.' };
  }

  // Rate-Limit VOR der Token-Aufloesung: sonst waere der Endpunkt ein
  // ungedeckeltes Orakel dafuer, welche Tokens existieren.
  const ip = getClientIp(await headers());
  const ipLimit = await checkAuthRateLimit(`melden:${ip}`, 'public-report-ip');
  if (!ipLimit.allowed) {
    return { error: formatRateLimitError(ipLimit.retryAfterSec) };
  }
  const tokenLimit = await checkAuthRateLimit(`melden:token:${token}`, 'public-report-link');
  if (!tokenLimit.allowed) {
    return { error: formatRateLimitError(tokenLimit.retryAfterSec) };
  }

  const resolution = await resolveReportLink(token);
  if (!resolution.ok) {
    return {
      error:
        resolution.reason === 'unavailable'
          ? 'Der Dienst ist gerade nicht erreichbar. Bitte versuchen Sie es in einigen Minuten erneut.'
          : 'Dieser Melde-Link ist nicht mehr gültig. Bitte wenden Sie sich direkt an die Hausverwaltung.',
    };
  }
  const link = resolution.context;

  const parsed = publicDefectReportSchema.safeParse({
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? undefined,
    location_details: formData.get('location_details') ?? undefined,
    category: formData.get('category') ?? undefined,
    priority: formData.get('priority') ?? 'normal',
    reporter_role: formData.get('reporter_role') ?? 'owner',
    reporter_name: formData.get('reporter_name') ?? undefined,
    reporter_contact: formData.get('reporter_contact') ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: 'Bitte prüfen Sie die markierten Felder.' };
  }

  // Datei vorab pruefen, bevor die Meldung existiert — sonst bekommt der
  // Melder eine angelegte Meldung PLUS eine Fehlermeldung und weiss nicht,
  // ob er nochmal absenden soll.
  const file = formData.get('file');
  let attachment: File | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > PUBLIC_UPLOAD_MAX_BYTES) {
      return {
        error: 'Das Foto ist zu groß.',
        fieldErrors: { file: 'Bitte ein Foto mit maximal 10 MB auswählen.' },
      };
    }
    if (!PUBLIC_UPLOAD_MIME.includes(file.type)) {
      return {
        error: 'Dieses Dateiformat wird nicht unterstützt.',
        fieldErrors: { file: 'Bitte ein Foto auswählen (JPG, PNG, WebP oder HEIC).' },
      };
    }
    attachment = file;
  }

  const service = createSupabaseServiceClient();

  const inserted = await service
    .from('defect_reports')
    .insert({
      tenant_id: link.tenantId,
      property_id: link.propertyId,
      building_id: link.buildingId,
      report_link_id: link.linkId,
      title: parsed.data.title,
      description: parsed.data.description,
      location_details: parsed.data.location_details,
      category: parsed.data.category,
      priority: parsed.data.priority,
      reporter_kind: parsed.data.reporter_role,
      reporter_name: parsed.data.reporter_name,
      reporter_contact: parsed.data.reporter_contact,
      // Leerer Code laesst den Trigger die Nummer vergeben (DR-JJJJ-NNNN).
      code: '',
    })
    .select('id, code')
    .single();

  if (inserted.error || !inserted.data) {
    Sentry.captureException(
      new Error(`Oeffentliche Meldung fehlgeschlagen: ${inserted.error?.message}`),
      { extra: { tenantId: link.tenantId, propertyId: link.propertyId, linkId: link.linkId } },
    );
    return { error: GENERIC_ERROR };
  }

  let attachmentFailed = false;
  if (attachment) {
    try {
      await storePublicAttachment({
        service,
        tenantId: link.tenantId,
        propertyId: link.propertyId,
        defectId: inserted.data.id,
        file: attachment,
      });
    } catch (err) {
      // Die Meldung ist gespeichert. Ein harter Fehler wuerde den Melder
      // glauben lassen, sie sei verloren, und er meldet ein zweites Mal —
      // die Disposition bekaeme denselben Mangel doppelt.
      Sentry.captureException(err, {
        extra: { defectId: inserted.data.id, tenantId: link.tenantId },
      });
      attachmentFailed = true;
    }
  }

  return {
    ok: true,
    code: inserted.data.code ?? undefined,
    defectId: inserted.data.id,
    attachmentFailed,
  };
}

/**
 * Speichert das Foto einer oeffentlichen Meldung.
 *
 * `uploaded_by` bleibt NULL — es gibt keinen Benutzer. Die Herkunft steht
 * an der Meldung (`report_link_id`), nicht an der Datei.
 */
async function storePublicAttachment(params: {
  service: ReturnType<typeof createSupabaseServiceClient>;
  tenantId: string;
  propertyId: string;
  defectId: string;
  file: File;
}): Promise<void> {
  const { service, tenantId, propertyId, defectId, file } = params;

  if (!isImageMime(file.type)) {
    throw new Error(`Unerwarteter MIME-Typ im oeffentlichen Upload: ${file.type}`);
  }

  // Das Re-Encode laedt sharp erst beim Aufruf — die Begruendung steht in
  // @/lib/images/strip-metadata. Hier zaehlt die Folge davon: wirft der
  // Helfer, faellt das in den try/catch des Aufrufers und wird zu
  // `attachmentFailed`. Die Meldung ist dann da, nur das Bild fehlt. Das ist
  // die richtige Rangfolge — der Mangel ist die Nachricht, das Foto Beiwerk.
  const source = Buffer.from(await file.arrayBuffer());
  const {
    buffer,
    mime: effectiveMime,
    extension: effectiveExt,
  } = await stripImageMetadata(source, file.type);

  const documentId = crypto.randomUUID();
  const storagePath = buildStoragePath({
    tenantId,
    entityType: 'defect_report',
    entityId: defectId,
    documentId,
    ext: effectiveExt,
  });

  const blob = new Blob([new Uint8Array(buffer)], { type: effectiveMime });
  const { error: uploadErr } = await service.storage
    .from(DOC_BUCKET)
    .upload(storagePath, blob, { contentType: effectiveMime, upsert: false });
  if (uploadErr) {
    throw new Error(`Storage-Upload fehlgeschlagen: ${uploadErr.message}`);
  }

  const { error: insertErr } = await service.from('documents').insert({
    id: documentId,
    tenant_id: tenantId,
    entity_type: 'defect_report',
    entity_id: defectId,
    property_id: propertyId,
    kind: 'photo',
    storage_path: storagePath,
    original_filename: (file.name || 'foto').slice(0, 255),
    mime_type: effectiveMime,
    byte_size: blob.size,
    caption: null,
    uploaded_by: null,
  });

  if (insertErr) {
    // Ohne documents-Zeile ist der Blob unsichtbar und unloeschbar — also weg.
    await service.storage.from(DOC_BUCKET).remove([storagePath]);
    throw new Error(`Dokument-Eintrag fehlgeschlagen: ${insertErr.message}`);
  }
}

/**
 * Der Anhang darf nachgereicht werden — genau einmal, direkt nach dem
 * Absenden, aus der Bestaetigungsansicht heraus. Ein "Foto vergessen"
 * ist die haeufigste Nachbesserung, und ohne diesen Weg bliebe nur:
 * dieselbe Meldung ein zweites Mal absetzen.
 *
 * Bewusst KEIN offener Nachreich-Pfad ueber die Meldungs-ID: die ID ist
 * nach dem Absenden im Browser des Melders, aber eine geratene fremde ID
 * waere sonst ein Upload-Ziel. Deshalb geht auch dieser Weg ueber Token +
 * Rate-Limit + einen Ownership-Check auf `report_link_id`.
 */
export async function attachPublicReportPhotoAction(
  _prev: PublicReportFormState,
  formData: FormData,
): Promise<PublicReportFormState> {
  const token = formData.get('token');
  const defectId = formData.get('defect_id');
  if (!isValidReportToken(token) || typeof defectId !== 'string') {
    return { error: 'Dieser Melde-Link ist nicht gültig.' };
  }

  const ip = getClientIp(await headers());
  const ipLimit = await checkAuthRateLimit(`melden:${ip}`, 'public-report-ip');
  if (!ipLimit.allowed) {
    return { error: formatRateLimitError(ipLimit.retryAfterSec) };
  }

  const resolution = await resolveReportLink(token);
  if (!resolution.ok) {
    return { error: 'Dieser Melde-Link ist nicht mehr gültig.' };
  }
  const link = resolution.context;

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Bitte ein Foto auswählen.' };
  }
  if (file.size > PUBLIC_UPLOAD_MAX_BYTES) {
    return { error: 'Bitte ein Foto mit maximal 10 MB auswählen.' };
  }
  if (!PUBLIC_UPLOAD_MIME.includes(file.type)) {
    return { error: 'Bitte ein Foto auswählen (JPG, PNG, WebP oder HEIC).' };
  }

  const service = createSupabaseServiceClient();

  // Ownership: die Meldung muss ueber GENAU DIESEN Link eingegangen sein.
  const { data: defect, error } = await service
    .from('defect_reports')
    .select('id, property_id')
    .eq('id', defectId)
    .eq('report_link_id', link.linkId)
    .maybeSingle();

  if (error) {
    Sentry.captureException(
      new Error(`Nachreichen: Meldung nicht lesbar: ${error.message}`),
      { extra: { defectId, linkId: link.linkId } },
    );
    return { error: GENERIC_ERROR };
  }
  if (!defect) {
    return { error: 'Diese Meldung wurde nicht gefunden.' };
  }

  try {
    await storePublicAttachment({
      service,
      tenantId: link.tenantId,
      propertyId: defect.property_id,
      defectId: defect.id,
      file,
    });
  } catch (err) {
    Sentry.captureException(err, { extra: { defectId: defect.id } });
    return { error: 'Das Foto konnte nicht gespeichert werden. Bitte erneut versuchen.' };
  }

  return { ok: true, attachmentFailed: false };
}
