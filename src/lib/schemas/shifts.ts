import { z } from 'zod';

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const optionalShortCode = z
  .string()
  .trim()
  .max(10)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const hhmm = z
  .string()
  .trim()
  .regex(HHMM_RE, 'Bitte Uhrzeit als HH:MM angeben.');

export const SHIFT_COLORS = [
  '#2563eb', // Blau
  '#0891b2', // Türkis
  '#059669', // Grün
  '#ca8a04', // Gelb
  '#ea580c', // Orange
  '#dc2626', // Rot
  '#7c3aed', // Violett
  '#475569', // Schiefer
] as const;

export const shiftInputSchema = z.object({
  name: z.string().trim().min(1, 'Bitte Bezeichnung angeben.').max(120),
  short_code: optionalShortCode,
  start_time: hhmm,
  end_time: hhmm,
  break_minutes: z.coerce.number().int().min(0, 'Keine negative Pause.').max(1440).default(0),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Ungültige Farbe.')
    .default('#2563eb'),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
  active: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  notes: optionalText,
});

export type ShiftInput = z.infer<typeof shiftInputSchema>;

/**
 * Bruttodauer einer Schicht in Minuten. Endet die Schicht rechnerisch vor
 * ihrem Beginn (oder exakt darauf), liegt das Ende am Folgetag — eine
 * Nachtschicht. Dann eine volle Umdrehung (24 h) aufaddieren.
 */
export function shiftGrossMinutes(startTime: string, endTime: string): number {
  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  if (s === null || e === null) return 0;
  let diff = e - s;
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

/** Nettoarbeitszeit = Brutto minus Pause, nie unter 0. */
export function shiftNetMinutes(startTime: string, endTime: string, breakMinutes: number): number {
  return Math.max(0, shiftGrossMinutes(startTime, endTime) - breakMinutes);
}

/** Endet die Schicht am Folgetag? */
export function shiftCrossesMidnight(startTime: string, endTime: string): boolean {
  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  if (s === null || e === null) return false;
  return e - s <= 0;
}

/** Minuten als „7:30 h" formatieren. */
export function formatDurationHours(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h} h` : `${h}:${String(m).padStart(2, '0')} h`;
}

/** „HH:MM:SS" oder „HH:MM" aus der DB auf „HH:MM" kürzen. */
export function formatTime(raw: string | null | undefined): string {
  if (!raw) return '—';
  return raw.slice(0, 5);
}

function toMinutes(hhmmValue: string): number | null {
  const trimmed = hhmmValue.slice(0, 5);
  if (!HHMM_RE.test(trimmed)) return null;
  const parts = trimmed.split(':');
  const h = Number(parts[0]);
  const min = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return h * 60 + min;
}
