import { z } from 'zod';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const requiredUuid = z
  .string()
  .trim()
  .min(1, 'Objekt ist erforderlich.')
  .refine((v) => UUID_RE.test(v), 'Ungültige ID.');

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || UUID_RE.test(v), 'Ungültige ID.');

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const optionalShort = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

// Leeres Feld → null (nicht 0): „keine Zeit erfasst" ist etwas anderes als
// „0 Minuten gearbeitet".
const optionalMinutes = z
  .union([z.literal(''), z.coerce.number().int().min(0, 'Keine negative Zeit.').max(100000)])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : v));

// Unterschrift ist ein PNG-Data-URL aus dem Zeichen-Canvas. Alles andere
// (leerer String, Fremdformat) wird verworfen.
const optionalSignature = z
  .string()
  .trim()
  .max(500000, 'Unterschrift ist zu groß.')
  .optional()
  .transform((v) => (v && v.startsWith('data:image/') ? v : null));

export const WORK_REPORT_STATUSES = ['draft', 'approved'] as const;
export type WorkReportStatus = (typeof WORK_REPORT_STATUSES)[number];

export const WORK_REPORT_STATUS_LABEL: Record<WorkReportStatus, string> = {
  draft: 'Entwurf',
  approved: 'Freigegeben',
};

export const WORK_REPORT_STATUS_TONE: Record<WorkReportStatus, 'warning' | 'success'> = {
  draft: 'warning',
  approved: 'success',
};

export const workReportInputSchema = z.object({
  property_id: requiredUuid,
  work_order_id: optionalUuid,
  title: z.string().trim().min(1, 'Bitte Titel angeben.').max(200),
  performed_on: z
    .string()
    .trim()
    .regex(DATE_RE, 'Bitte Datum angeben.'),
  description: z
    .string()
    .trim()
    .min(1, 'Bitte beschreiben Sie die geleistete Arbeit.')
    .max(5000),
  minutes_worked: optionalMinutes,
  material_used: optionalText,
  signer_name: optionalShort,
  signature_data: optionalSignature,
});

export type WorkReportInput = z.infer<typeof workReportInputSchema>;

/** Minuten als „1:30 h" bzw. „45 Min." formatieren. */
export function formatWorkedTime(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${minutes} Min.`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h}:${String(m).padStart(2, '0')} h`;
}
