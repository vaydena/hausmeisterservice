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

const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Ungültige E-Mail.');

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || UUID_RE.test(v), 'Ungültige ID.');

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine(
    (v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v),
    'Ungültiges Datum (YYYY-MM-DD).',
  );

export const residentInputSchema = z.object({
  first_name: z.string().trim().min(1, 'Vorname ist erforderlich.').max(100),
  last_name: z.string().trim().min(1, 'Nachname ist erforderlich.').max(100),
  email: optionalEmail,
  phone: optionalShort,
  property_id: optionalUuid,
  building_id: optionalUuid,
  unit_id: optionalUuid,
  moved_in: optionalDate,
  moved_out: optionalDate,
  notes: optionalText,
});

export type ResidentInput = z.infer<typeof residentInputSchema>;
