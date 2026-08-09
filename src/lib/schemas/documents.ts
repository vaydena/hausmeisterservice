import { z } from 'zod';

export const DOC_ENTITY_TYPES = [
  'work_order',
  'defect_report',
  'checklist_run_item',
  'property',
  'unit',
] as const;
export type DocumentEntityType = (typeof DOC_ENTITY_TYPES)[number];

export const DOC_KINDS = ['photo', 'file'] as const;
export type DocumentKind = (typeof DOC_KINDS)[number];

export const DOC_MAX_BYTES = 26_214_400; // 25 MB, muss zum DB-CHECK und Bucket-Limit passen

export const DOC_ALLOWED_MIME: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
];

const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export function isImageMime(mime: string): boolean {
  return IMAGE_MIME.has(mime);
}

export function inferKind(mime: string): DocumentKind {
  return isImageMime(mime) ? 'photo' : 'file';
}

export const documentUploadTargetSchema = z.object({
  entity_type: z.enum(DOC_ENTITY_TYPES),
  entity_id: z.string().uuid('Ungültige Entität.'),
  caption: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type DocumentUploadTarget = z.infer<typeof documentUploadTargetSchema>;

export const DOC_KIND_LABEL: Record<DocumentKind, string> = {
  photo: 'Foto',
  file: 'Datei',
};

export const DOC_ENTITY_LABEL: Record<DocumentEntityType, string> = {
  work_order: 'Auftrag',
  defect_report: 'Meldung',
  checklist_run_item: 'Prüfpunkt',
  property: 'Objekt',
  unit: 'Einheit',
};

/**
 * Storage-Path-Format: {tenant_id}/{entity_type}/{entity_id}/{document_id}.{ext}
 * Die Storage-RLS validiert (storage.foldername(name))[1] gegen den Tenant.
 */
export function buildStoragePath(params: {
  tenantId: string;
  entityType: DocumentEntityType;
  entityId: string;
  documentId: string;
  ext: string;
}): string {
  const cleanExt = params.ext.replace(/^\./, '').toLowerCase() || 'bin';
  return `${params.tenantId}/${params.entityType}/${params.entityId}/${params.documentId}.${cleanExt}`;
}

/**
 * Extension aus MIME/Filename ableiten. Wir bevorzugen die Extension aus dem
 * Original-Dateinamen (behält .heic etc.), fallen sonst auf MIME zurück.
 */
export function pickExtension(originalFilename: string, mimeType: string): string {
  const fromName = originalFilename.match(/\.([a-z0-9]{1,8})$/i)?.[1];
  if (fromName) return fromName.toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
    'text/csv': 'csv',
  };
  return map[mimeType] ?? 'bin';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
