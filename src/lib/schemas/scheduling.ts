import { z } from 'zod';
import { localDateTimeRequired } from './datetime-local';
import { APP_TIME_ZONE, toLocalDateTimeInput } from '@/lib/utils/datetime-local';

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

// "yyyy-MM-ddTHH:mm" — als Berliner Lokalzeit interpretieren; der Browser
// schickt die Uhrzeit ohne Zonenoffset.
//
// Sprint 113: der Kommentar war richtig, `new Date(v)` hat aber die Zone des
// Node-Prozesses genommen. Ausserdem hat der alte Transform bei unlesbarem
// Datum geworfen — mitten im Transform, also an safeParse vorbei und als 500
// beim Nutzer statt als Feldfehler.
const localDateTime = localDateTimeRequired('Zeitpunkt fehlt.', 'Ungültiges Datum.');

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
  return toLocalDateTimeInput(iso);
}

const TIME_SHORT = new Intl.DateTimeFormat('de-DE', {
  timeZone: APP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Uhrzeit eines Zeitpunkts in Berliner Zeit — wie im Rest der Anwendung. */
export function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '–' : TIME_SHORT.format(d);
}
