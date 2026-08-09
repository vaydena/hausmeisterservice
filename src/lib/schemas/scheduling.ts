import { z } from 'zod';

export const SCHEDULE_KINDS = [
  'availability',
  'unavailability',
  'meeting',
  'training',
  'standby',
  'other',
] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export const SCHEDULE_KIND_LABEL: Record<ScheduleKind, string> = {
  availability: 'Verfügbar',
  unavailability: 'Abwesend',
  meeting: 'Termin',
  training: 'Schulung',
  standby: 'Rufbereitschaft',
  other: 'Sonstiges',
};

export const SCHEDULE_KIND_TONE: Record<
  ScheduleKind,
  'primary' | 'warning' | 'success' | 'neutral' | 'muted' | 'danger'
> = {
  availability: 'success',
  unavailability: 'danger',
  meeting: 'primary',
  training: 'primary',
  standby: 'warning',
  other: 'neutral',
};

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const localDateTime = z
  .string()
  .trim()
  .min(1, 'Zeitpunkt fehlt.')
  .transform((v) => {
    // "yyyy-MM-ddTHH:mm" — als Berliner Lokalzeit interpretieren; Browser
    // schickt bereits die lokale Zeit ohne Zonenoffset.
    const date = new Date(v);
    if (Number.isNaN(date.getTime())) throw new Error('Ungültiges Datum.');
    return date.toISOString();
  });

const baseFields = {
  employee_id: z.string().uuid({ message: 'Mitarbeiter fehlt.' }),
  kind: z.enum(SCHEDULE_KINDS),
  title: z.string().trim().min(1, 'Titel fehlt.').max(200),
  note: optionalText,
  start_at: localDateTime,
  end_at: localDateTime,
  all_day: z
    .union([z.literal('on'), z.literal('true'), z.literal('false'), z.literal(''), z.undefined()])
    .transform((v) => v === 'on' || v === 'true'),
};

export const createEntrySchema = z
  .object(baseFields)
  .superRefine((val, ctx) => {
    const start = new Date(val.start_at).getTime();
    const end = new Date(val.end_at).getTime();
    if (end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ende muss nach dem Start liegen.',
        path: ['end_at'],
      });
    }
    if (end - start > 30 * 24 * 60 * 60 * 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Termin darf höchstens 30 Tage dauern.',
        path: ['end_at'],
      });
    }
  });

export const updateEntrySchema = createEntrySchema;

/**
 * ISO → Wert für <input type="datetime-local"> (lokale Berlin-Zeit).
 */
export function toDateTimeLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Datum → Beginn des Wochentags (Montag 00:00 lokal).
 */
export function startOfWeek(date: Date = new Date()): Date {
  const d = new Date(date);
  const diff = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatDayShort(date: Date): string {
  return date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export function formatTimeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/**
 * "yyyy-MM-dd" aus einem Date-Objekt (lokal). Wird als URL-Parameter für
 * `?week=` genutzt, damit die URL kanonisch bleibt.
 */
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseIsoDate(input: string | undefined): Date | null {
  if (!input) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
