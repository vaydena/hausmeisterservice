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

/**
 * Privater Storage-Bucket. Steht hier und nicht in `documents/actions.ts`,
 * weil seit Sprint 120 auch der Download-Handler unter `/api/documents`
 * darauf zugreift — zwei Literale wuerden beim ersten Umzug auseinanderlaufen,
 * und der Fehler faellt erst auf, wenn ein Download ins Leere greift.
 */
export const DOC_BUCKET = 'attachments';

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
 * Sprint 120: der Rueckweg von einem Dokument zu seiner Entitaet.
 *
 * Dokumente haben keine eigene Detailseite und sollen auch keine bekommen:
 * ein Foto ohne den Auftrag, zu dem es gehoert, ist eine Datei ohne Aussage.
 * Die zentrale Liste unter `/documents` braucht deshalb pro Zeile den Weg
 * zurueck zu dem Vorgang, an dem das Dokument haengt.
 *
 * `unit` fuehrt auf das Objekt — eine Einheit hat keine eigene Route, sie
 * steht auf der Objektseite. Dafuer ist `documents.property_id` denormalisiert
 * vorhanden, ein Join entfaellt.
 *
 * `checklist_run_item` braucht die Run-ID, die nicht in der documents-Zeile
 * steht; der Aufrufer loest sie gebuendelt fuer die sichtbare Seite auf. Fehlt
 * sie, liefert die Funktion `null` statt auf einen geratenen Pfad zu zeigen —
 * ein Link, der ins 404 fuehrt, ist schlechter als gar keiner.
 */
export function documentEntityHref(
  entityType: DocumentEntityType,
  entityId: string,
  ctx: { propertyId?: string | null; checklistRunId?: string | null } = {},
): string | null {
  switch (entityType) {
    case 'work_order':
      return `/work-orders/${entityId}`;
    case 'defect_report':
      return `/defect-reports/${entityId}`;
    case 'property':
      return `/properties/${entityId}`;
    case 'unit':
      return ctx.propertyId ? `/properties/${ctx.propertyId}` : null;
    case 'checklist_run_item':
      return ctx.checklistRunId ? `/checklist-runs/${ctx.checklistRunId}` : null;
    default: {
      // Kommt ein Wert zu DOC_ENTITY_TYPES dazu, ohne hier bedacht zu werden,
      // ist `entityType` nicht mehr `never` und der TypeCheck faellt aus.
      // Zur Laufzeit trotzdem null: der DB-CHECK haelt die Menge zwar fest,
      // aber ein `undefined` als href waere eine kaputte Seite statt einer
      // fehlenden Verlinkung.
      const exhaustive: never = entityType;
      void exhaustive;
      return null;
    }
  }
}

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
