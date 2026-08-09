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

const optionalPositiveInt = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? Number(v) : null))
  .refine(
    (v) => v === null || (!Number.isNaN(v) && Number.isInteger(v) && v > 0 && v < 10000),
    'Ungültige Zahl.',
  );

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine(
    (v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v),
    'Ungültiges Datum (YYYY-MM-DD).',
  );

export const maintenancePlanInputSchema = z.object({
  title: z.string().trim().min(3, 'Titel ist erforderlich (mind. 3 Zeichen).').max(200),
  description: optionalText,
  category: optionalShort,
  property_id: z
    .string()
    .trim()
    .min(1, 'Objekt ist erforderlich.')
    .refine((v) => UUID_RE.test(v), 'Ungültige Objekt-ID.'),
  building_id: optionalUuid,
  unit_id: optionalUuid,
  interval_days: z
    .string()
    .trim()
    .transform((v) => Number(v))
    .refine(
      (v) => !Number.isNaN(v) && Number.isInteger(v) && v > 0 && v <= 3650,
      'Intervall muss zwischen 1 und 3650 Tagen liegen.',
    ),
  estimated_minutes: optionalPositiveInt,
  priority: z.enum(['low', 'normal', 'high', 'emergency']).default('normal'),
  assigned_role: optionalShort,
  next_due_at: optionalDate,
  active: z
    .string()
    .optional()
    .transform((v) => v === 'on' || v === 'true'),
  notes: optionalText,
});

export type MaintenancePlanInput = z.infer<typeof maintenancePlanInputSchema>;

export const INTERVAL_PRESETS: Array<{ days: number; label: string }> = [
  { days: 7, label: 'Wöchentlich' },
  { days: 14, label: '2-wöchentlich' },
  { days: 30, label: 'Monatlich' },
  { days: 90, label: 'Quartalsweise' },
  { days: 180, label: 'Halbjährlich' },
  { days: 365, label: 'Jährlich' },
];

export function intervalLabel(days: number): string {
  const preset = INTERVAL_PRESETS.find((p) => p.days === days);
  return preset ? preset.label : `alle ${days} Tage`;
}

export function daysUntil(dateIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateIso);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export type DueBucket = 'overdue' | 'due_soon' | 'upcoming' | 'inactive';

export function dueBucket(nextDueAt: string, active: boolean): DueBucket {
  if (!active) return 'inactive';
  const diff = daysUntil(nextDueAt);
  if (diff < 0) return 'overdue';
  if (diff <= 7) return 'due_soon';
  return 'upcoming';
}

export const DUE_LABEL: Record<DueBucket, string> = {
  overdue: 'Überfällig',
  due_soon: 'Bald fällig',
  upcoming: 'Geplant',
  inactive: 'Inaktiv',
};

export const DUE_TONE: Record<DueBucket, 'danger' | 'warning' | 'neutral' | 'muted'> = {
  overdue: 'danger',
  due_soon: 'warning',
  upcoming: 'neutral',
  inactive: 'muted',
};
