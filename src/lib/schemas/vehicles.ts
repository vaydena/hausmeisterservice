import { z } from 'zod';
import { formatDateOnly } from '@/lib/utils/format';

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

const optionalVin = z
  .string()
  .trim()
  .max(32)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || v.length >= 5, 'VIN mindestens 5 Zeichen.');

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

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const optionalInt = z
  .union([z.literal(''), z.coerce.number().int().nonnegative()])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : (v as number)));

const optionalPrice = z
  .union([z.literal(''), z.coerce.number().nonnegative()])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : (v as number)));

export const VEHICLE_TYPES = [
  'car',
  'van',
  'truck',
  'pickup',
  'trailer',
  'machinery',
  'other',
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/**
 * Sprint 109: Fahrzeugarten, die auf oeffentlichen Strassen bewegt werden
 * und deshalb HU (§29 StVZO) und eine laufende Haftpflicht brauchen —
 * Anhaenger eingeschlossen, die haben eine eigene HU.
 *
 * Baumaschinen und "Sonstiges" stehen bewusst nicht drin: eine Motorsaege
 * ohne TUEV-Datum ist gepflegt, nicht unueberwacht. Ohne diese
 * Unterscheidung wuerde die Warnung fuer fehlende Fristen bei jedem
 * Geraet anschlagen und damit binnen einer Woche ignoriert.
 */
export const ROAD_VEHICLE_TYPES: ReadonlySet<string> = new Set<VehicleType>([
  'car',
  'van',
  'truck',
  'pickup',
  'trailer',
]);

export function needsRoadDeadlines(vehicleType: string): boolean {
  return ROAD_VEHICLE_TYPES.has(vehicleType);
}

export const FUEL_TYPES = ['petrol', 'diesel', 'electric', 'hybrid', 'lpg', 'other'] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const VEHICLE_STATUSES = ['active', 'inactive', 'maintenance', 'retired'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const EVENT_KINDS = [
  'tuev',
  'service',
  'tire_change',
  'repair',
  'refuel',
  'mileage_reading',
  'insurance_renewal',
  'other',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const vehicleInputSchema = z.object({
  license_plate: z.string().trim().min(1, 'Kennzeichen fehlt.').max(15).transform((v) => v.toUpperCase()),
  make: z.string().trim().min(1, 'Marke fehlt.').max(60),
  model: z.string().trim().min(1, 'Modell fehlt.').max(60),
  vehicle_type: z.enum(VEHICLE_TYPES).default('car'),
  fuel_type: z.enum(FUEL_TYPES).default('diesel'),
  year: z
    .union([z.literal(''), z.coerce.number().int().min(1900).max(2100)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : (v as number))),
  vin: optionalVin,
  mileage_km: optionalInt,
  primary_driver_user_id: optionalUuid,
  next_tuev_at: optionalDate,
  next_service_at: optionalDate,
  next_service_due_km: optionalInt,
  insurance_expires_at: optionalDate,
  storage_location: optionalShort,
  notes: optionalText,
});

export type VehicleInput = z.infer<typeof vehicleInputSchema>;

export const vehicleStatusUpdateSchema = z.object({
  vehicle_id: requiredUuid,
  status: z.enum(VEHICLE_STATUSES),
});

export const eventInputSchema = z.object({
  vehicle_id: requiredUuid,
  kind: z.enum(EVENT_KINDS),
  event_date: z
    .string()
    .trim()
    .min(1, 'Datum fehlt.')
    .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Ungültiges Datum.'),
  mileage_km: optionalInt,
  cost_eur: optionalPrice,
  vendor: optionalShort,
  next_due_at: optionalDate,
  note: optionalText,
});

export type EventInput = z.infer<typeof eventInputSchema>;

export const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  car: 'PKW',
  van: 'Transporter',
  truck: 'LKW',
  pickup: 'Pickup',
  trailer: 'Anhänger',
  machinery: 'Baumaschine',
  other: 'Sonstiges',
};

export const FUEL_TYPE_LABEL: Record<FuelType, string> = {
  petrol: 'Benzin',
  diesel: 'Diesel',
  electric: 'Elektro',
  hybrid: 'Hybrid',
  lpg: 'LPG/CNG',
  other: 'Sonstiges',
};

export const STATUS_LABEL: Record<VehicleStatus, string> = {
  active: 'Aktiv',
  inactive: 'Inaktiv',
  maintenance: 'In Wartung',
  retired: 'Ausgemustert',
};

export const STATUS_TONE: Record<VehicleStatus, 'success' | 'muted' | 'warning' | 'danger'> = {
  active: 'success',
  inactive: 'muted',
  maintenance: 'warning',
  retired: 'danger',
};

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  tuev: 'TÜV/HU',
  service: 'Service/Inspektion',
  tire_change: 'Reifenwechsel',
  repair: 'Reparatur',
  refuel: 'Tanken',
  mileage_reading: 'Km-Stand',
  insurance_renewal: 'Versicherung',
  other: 'Sonstiges',
};

export const EVENT_KIND_TONE: Record<EventKind, 'success' | 'muted' | 'warning' | 'danger'> = {
  tuev: 'warning',
  service: 'warning',
  tire_change: 'muted',
  repair: 'danger',
  refuel: 'muted',
  mileage_reading: 'muted',
  insurance_renewal: 'warning',
  other: 'muted',
};

/**
 * Sprint 109: `dueTone()` stand hier und lieferte drei Stufen — danger fuer
 * "abgelaufen ODER in <= 14 Tagen", warning fuer "<= 60 Tage", muted sonst.
 * Genau diese Zusammenlegung war das Problem: ein abgelaufener TUEV war von
 * einem in zehn Tagen faelligen nicht zu unterscheiden. Ersetzt durch
 * deadlineStatus() / DEADLINE_TONE in lib/deadlines/status.ts, das
 * 'expired' als eigenen Zustand kennt und in Kalendertagen statt in
 * 24-Stunden-Bloecken rechnet.
 */
export function dueLabel(dueDate: string | null | undefined): string {
  // Sprint 113: `next_tuev_at` & Co. sind DATE-Spalten. `new Date()` liest sie
  // als UTC-Mitternacht; sie danach in einer Zone zu formatieren, stellt einer
  // Angabe ohne Uhrzeit eine Zeitzonenfrage. Deshalb `formatDateOnly`.
  return formatDateOnly(dueDate);
}
