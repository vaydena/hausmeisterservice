import { z } from 'zod';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const PHOTO_PHASES = ['before', 'during', 'after', 'general'] as const;
export type PhotoPhase = (typeof PHOTO_PHASES)[number];

export const PHOTO_PHASE_LABEL: Record<PhotoPhase, string> = {
  before: 'Vorher',
  during: 'Während',
  after: 'Nachher',
  general: 'Allgemein',
};

export const PHOTO_PHASE_TONE: Record<PhotoPhase, 'muted' | 'warning' | 'success' | 'neutral'> = {
  before: 'warning',
  during: 'neutral',
  after: 'success',
  general: 'muted',
};

/** Nur Bilder — das Fotomodul nimmt bewusst keine PDFs o. Ä. an. */
export const PHOTO_ALLOWED_MIME: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

export const PHOTO_MAX_BYTES = 26_214_400; // 25 MB, passt zu DB-CHECK und Bucket-Limit

export const photoUploadTargetSchema = z.object({
  property_id: z
    .string()
    .trim()
    .min(1, 'Bitte Objekt wählen.')
    .refine((v) => UUID_RE.test(v), 'Ungültige Objekt-ID.'),
  work_order_id: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine((v) => v === null || UUID_RE.test(v), 'Ungültige Auftrags-ID.'),
  phase: z.enum(PHOTO_PHASES).default('general'),
  caption: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type PhotoUploadTarget = z.infer<typeof photoUploadTargetSchema>;

/**
 * Storage-Path: {tenant_id}/photos/{property_id}/{photo_id}.{ext}
 * Erster Pfadteil ist die tenant_id — damit greift die vorhandene Storage-RLS
 * des `attachments`-Buckets ohne zusätzliche Policy.
 */
export function buildPhotoStoragePath(params: {
  tenantId: string;
  propertyId: string;
  photoId: string;
  ext: string;
}): string {
  const cleanExt = params.ext.replace(/^\./, '').toLowerCase() || 'jpg';
  return `${params.tenantId}/photos/${params.propertyId}/${params.photoId}.${cleanExt}`;
}
