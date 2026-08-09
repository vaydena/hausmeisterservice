import { z } from 'zod';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || UUID_RE.test(v), 'Ungültige ID.');

export const defectReportInputSchema = z.object({
  title: z.string().trim().min(3, 'Bitte kurz beschreiben (mind. 3 Zeichen).').max(200),
  description: optionalText,
  category: optionalShort,
  priority: z.enum(['low', 'normal', 'high', 'emergency']).default('normal'),
  property_id: z
    .string()
    .trim()
    .min(1, 'Objekt ist erforderlich.')
    .refine((v) => UUID_RE.test(v), 'Ungültige Objekt-ID.'),
  building_id: optionalUuid,
  unit_id: optionalUuid,
  location_details: optionalShort,
  reporter_kind: z.enum(['resident', 'owner', 'staff', 'anonymous']).default('staff'),
  reporter_name: optionalShort,
  reporter_contact: optionalShort,
});

export type DefectReportInput = z.infer<typeof defectReportInputSchema>;

export const defectReportStatusSchema = z.enum(['new', 'reviewing', 'converted', 'rejected']);
export type DefectReportStatus = z.infer<typeof defectReportStatusSchema>;

export const STATUS_LABEL: Record<DefectReportStatus, string> = {
  new: 'Neu',
  reviewing: 'In Prüfung',
  converted: 'In Auftrag überführt',
  rejected: 'Abgelehnt',
};

export const STATUS_TONE: Record<
  DefectReportStatus,
  'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'muted'
> = {
  new: 'primary',
  reviewing: 'warning',
  converted: 'success',
  rejected: 'muted',
};

export const STATUS_ORDER: DefectReportStatus[] = ['new', 'reviewing', 'converted', 'rejected'];

export const REPORTER_KIND_LABEL: Record<DefectReportInput['reporter_kind'], string> = {
  resident: 'Bewohner',
  owner: 'Eigentümer',
  staff: 'Mitarbeiter',
  anonymous: 'Anonym',
};

export const PRIORITY_LABEL: Record<DefectReportInput['priority'], string> = {
  low: 'Niedrig',
  normal: 'Normal',
  high: 'Hoch',
  emergency: 'Notfall',
};
