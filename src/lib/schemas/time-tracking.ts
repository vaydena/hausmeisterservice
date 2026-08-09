import { z } from 'zod';

export const ENTRY_KINDS = ['work', 'break', 'travel', 'standby'] as const;
export type TimeEntryKind = (typeof ENTRY_KINDS)[number];

export const ENTRY_KIND_LABEL: Record<TimeEntryKind, string> = {
  work: 'Arbeit',
  break: 'Pause',
  travel: 'Fahrtzeit',
  standby: 'Rufbereitschaft',
};

export const ENTRY_KIND_TONE: Record<TimeEntryKind, 'primary' | 'muted' | 'warning' | 'neutral'> = {
  work: 'primary',
  break: 'muted',
  travel: 'warning',
  standby: 'neutral',
};

const optionalText = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine(
    (v) => v === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
    'Ungültige ID.',
  );

/**
 * Datetime aus dem <input type="datetime-local"> (yyyy-MM-ddTHH:mm) — wird als
 * lokale Berlin-Zeit interpretiert und in ISO umgewandelt.
 */
const dateTimeLocal = z
  .string()
  .trim()
  .min(1, 'Zeitpunkt fehlt.')
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Ungültiges Datum.')
  .transform((v) => new Date(v).toISOString());

const dateTimeLocalOptional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || !Number.isNaN(new Date(v).getTime()), 'Ungültiges Datum.')
  .transform((v) => (v === null ? null : new Date(v).toISOString()));

export const punchInSchema = z.object({
  kind: z.enum(ENTRY_KINDS).default('work'),
  work_order_id: optionalUuid,
  property_id: optionalUuid,
  note: optionalText,
});

export const manualEntrySchema = z
  .object({
    kind: z.enum(ENTRY_KINDS).default('work'),
    start_at: dateTimeLocal,
    end_at: dateTimeLocal,
    work_order_id: optionalUuid,
    property_id: optionalUuid,
    note: optionalText,
    employee_id: optionalUuid,
  })
  .superRefine((data, ctx) => {
    if (new Date(data.end_at) <= new Date(data.start_at)) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_at'],
        message: 'Ende muss nach dem Start liegen.',
      });
    }
    const diffMinutes = (new Date(data.end_at).getTime() - new Date(data.start_at).getTime()) / 60000;
    if (diffMinutes > 24 * 60) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_at'],
        message: 'Zeitspanne größer als 24 Stunden ist nicht erlaubt.',
      });
    }
  });

export const updateEntrySchema = z
  .object({
    entry_id: z.string().uuid('Ungültige Eintrags-ID.'),
    kind: z.enum(ENTRY_KINDS),
    start_at: dateTimeLocal,
    end_at: dateTimeLocalOptional,
    work_order_id: optionalUuid,
    property_id: optionalUuid,
    note: optionalText,
  })
  .superRefine((data, ctx) => {
    if (data.end_at && new Date(data.end_at) <= new Date(data.start_at)) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_at'],
        message: 'Ende muss nach dem Start liegen.',
      });
    }
  });

export type PunchInInput = z.infer<typeof punchInSchema>;
export type ManualEntryInput = z.infer<typeof manualEntrySchema>;
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;

/** Dauer in Minuten zwischen zwei ISO-Timestamps, gerundet auf Minute. */
export function minutesBetween(startIso: string, endIso: string | null): number {
  if (!endIso) return 0;
  return Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));
}

/** Dauer als H:MM (z. B. 8:15). */
export function formatDurationMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

/**
 * Live-Dauer eines offenen Eintrags ab start_at bis jetzt (Server-Rendering
 * bekommt hier den Server-`now`; für Live-Update braucht es einen Client-Timer).
 */
export function elapsedSince(startIso: string, now = new Date()): number {
  return Math.max(0, Math.round((now.getTime() - new Date(startIso).getTime()) / 60000));
}

/** Für <input type="datetime-local"> — ISO → yyyy-MM-ddTHH:mm (lokal). */
export function toDateTimeLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
