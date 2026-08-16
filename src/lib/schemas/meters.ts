import { z } from 'zod';
import { localDateTimeRequired } from './datetime-local';

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

const optionalMeterNumber = z
  .string()
  .trim()
  .max(100)
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
  .min(1, 'Objekt ist erforderlich.')
  .refine((v) => UUID_RE.test(v), 'Ungültige ID.');

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

export const UTILITY_KINDS = [
  'electricity',
  'gas',
  'water_cold',
  'water_hot',
  'heating',
  'heat_cost_allocator',
  'other',
] as const;
export type UtilityKind = (typeof UTILITY_KINDS)[number];

export const METER_STATUSES = ['active', 'inactive', 'defective', 'replaced'] as const;
export type MeterStatus = (typeof METER_STATUSES)[number];

export const READING_SOURCES = ['manual', 'photo', 'estimated', 'gateway'] as const;
export type ReadingSource = (typeof READING_SOURCES)[number];

export const meterInputSchema = z.object({
  label: z.string().trim().min(1, 'Bitte Bezeichnung angeben.').max(200),
  meter_number: optionalMeterNumber,
  utility_kind: z.enum(UTILITY_KINDS).default('electricity'),
  unit_of_measure: z
    .string()
    .trim()
    .min(1, 'Einheit fehlt.')
    .max(20)
    .default('kWh'),
  property_id: requiredUuid,
  building_id: optionalUuid,
  unit_id: optionalUuid,
  location_note: optionalShort,
  digits_before: z.coerce.number().int().min(1).max(10).default(5),
  digits_after: z.coerce.number().int().min(0).max(4).default(0),
  installed_at: optionalDate,
  last_replacement_at: optionalDate,
  notes: optionalText,
});

export type MeterInput = z.infer<typeof meterInputSchema>;

export const meterStatusUpdateSchema = z.object({
  meter_id: requiredUuid,
  status: z.enum(METER_STATUSES),
});

export const readingInputSchema = z.object({
  meter_id: requiredUuid,
  // Sprint 113: Der Ablesezeitpunkt sortiert die Ablesungen und schneidet
  // Abrechnungsperioden. Eine Ablesung am 31.12. um 23:30, in der falschen
  // Zone gelesen, landet im Folgejahr — und der Verbrauch beider Perioden
  // stimmt danach nicht mehr. Die Umrechnung stand vorher in der
  // Server-Action und damit in der Prozess-Zeitzone.
  read_at: localDateTimeRequired('Ablesezeitpunkt fehlt.', 'Ungültiges Datum.'),
  reading: z
    .coerce
    .number({ message: 'Zählerstand als Zahl angeben.' })
    .nonnegative('Zählerstand darf nicht negativ sein.')
    .max(9_999_999_999, 'Zählerstand zu hoch.'),
  source: z.enum(READING_SOURCES).default('manual'),
  is_reset: z
    .union([z.literal('on'), z.literal('true'), z.literal('1'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'on' || v === 'true' || v === '1'),
  reference_work_order_id: optionalUuid,
  note: optionalText,
});

export type ReadingInput = z.infer<typeof readingInputSchema>;

export const UTILITY_LABEL: Record<UtilityKind, string> = {
  electricity: 'Strom',
  gas: 'Gas',
  water_cold: 'Kaltwasser',
  water_hot: 'Warmwasser',
  heating: 'Wärme',
  heat_cost_allocator: 'Heizkostenverteiler',
  other: 'Sonstiger',
};

export const UTILITY_DEFAULT_UNIT: Record<UtilityKind, string> = {
  electricity: 'kWh',
  gas: 'm³',
  water_cold: 'm³',
  water_hot: 'm³',
  heating: 'kWh',
  heat_cost_allocator: 'Einh.',
  other: '',
};

export const STATUS_LABEL: Record<MeterStatus, string> = {
  active: 'Aktiv',
  inactive: 'Inaktiv',
  defective: 'Defekt',
  replaced: 'Getauscht',
};

export const STATUS_TONE: Record<MeterStatus, 'success' | 'muted' | 'danger' | 'warning'> = {
  active: 'success',
  inactive: 'muted',
  defective: 'danger',
  replaced: 'warning',
};

export const SOURCE_LABEL: Record<ReadingSource, string> = {
  manual: 'Manuell',
  photo: 'Foto',
  estimated: 'Geschätzt',
  gateway: 'Gateway',
};
