import { z } from 'zod';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || UUID_RE.test(v), 'Ungültige ID.');

const requiredUuid = z
  .string()
  .trim()
  .min(1, 'ID fehlt.')
  .refine((v) => UUID_RE.test(v), 'Ungültige ID.');

const optionalDateTime = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine(
    (v) => v === null || !Number.isNaN(new Date(v).getTime()),
    'Ungültige Zeit.',
  );

const optionalInt = z
  .union([z.literal(''), z.coerce.number().int().nonnegative()])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : (v as number)));

export const TOUR_STATUSES = ['draft', 'planned', 'in_progress', 'completed', 'cancelled'] as const;
export type TourStatus = (typeof TOUR_STATUSES)[number];

export const STOP_STATUSES = ['pending', 'arrived', 'completed', 'skipped'] as const;
export type StopStatus = (typeof STOP_STATUSES)[number];

export const tourInputSchema = z.object({
  title: z.string().trim().min(1, 'Titel fehlt.').max(200),
  planned_date: z
    .string()
    .trim()
    .min(1, 'Datum fehlt.')
    .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Ungültiges Datum.'),
  driver_user_id: optionalUuid,
  vehicle_id: optionalUuid,
  notes: optionalText,
});

export type TourInput = z.infer<typeof tourInputSchema>;

export const tourStatusUpdateSchema = z.object({
  tour_id: requiredUuid,
  status: z.enum(TOUR_STATUSES),
});

export const stopInputSchema = z.object({
  tour_id: requiredUuid,
  property_id: optionalUuid,
  label: z.string().trim().min(1, 'Bezeichnung fehlt.').max(200),
  planned_arrival_at: optionalDateTime,
  planned_departure_at: optionalDateTime,
  duration_minutes: optionalInt,
  note: optionalText,
});

export type StopInput = z.infer<typeof stopInputSchema>;

export const stopUpdateSchema = stopInputSchema.extend({
  stop_id: requiredUuid,
});

export const stopStatusUpdateSchema = z.object({
  stop_id: requiredUuid,
  status: z.enum(STOP_STATUSES),
});

export const reorderStopsSchema = z.object({
  tour_id: requiredUuid,
  stop_ids: z.array(requiredUuid).min(1, 'Keine Stopps.'),
});

export const TOUR_STATUS_LABEL: Record<TourStatus, string> = {
  draft: 'Entwurf',
  planned: 'Geplant',
  in_progress: 'Läuft',
  completed: 'Abgeschlossen',
  cancelled: 'Abgebrochen',
};

export const TOUR_STATUS_TONE: Record<TourStatus, 'muted' | 'primary' | 'success' | 'warning' | 'danger'> = {
  draft: 'muted',
  planned: 'primary',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger',
};

export const STOP_STATUS_LABEL: Record<StopStatus, string> = {
  pending: 'Offen',
  arrived: 'Vor Ort',
  completed: 'Erledigt',
  skipped: 'Übersprungen',
};

export const STOP_STATUS_TONE: Record<StopStatus, 'muted' | 'primary' | 'success' | 'danger'> = {
  pending: 'muted',
  arrived: 'primary',
  completed: 'success',
  skipped: 'danger',
};

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE');
}
