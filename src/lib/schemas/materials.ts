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

const optionalSku = z
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
  .min(1, 'ID fehlt.')
  .refine((v) => UUID_RE.test(v), 'Ungültige ID.');

export const MATERIAL_CATEGORIES = [
  'cleaning',
  'hardware',
  'safety',
  'electric',
  'plumbing',
  'paint',
  'garden',
  'winter',
  'office',
  'consumable',
  'other',
] as const;
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export const MATERIAL_STATUSES = ['active', 'inactive'] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];

export const MOVEMENT_KINDS = ['receipt', 'issue', 'adjustment', 'write_off'] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const materialInputSchema = z.object({
  label: z.string().trim().min(1, 'Bitte Bezeichnung angeben.').max(200),
  sku: optionalSku,
  category: z.enum(MATERIAL_CATEGORIES).default('other'),
  unit: z.string().trim().min(1, 'Einheit fehlt.').max(20).default('Stk'),
  min_stock: z.coerce
    .number({ message: 'Meldebestand als Zahl angeben.' })
    .nonnegative('Meldebestand darf nicht negativ sein.')
    .default(0),
  unit_cost: z
    .union([
      z.literal(''),
      z.coerce.number().nonnegative('Preis darf nicht negativ sein.'),
    ])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : (v as number))),
  storage_location: optionalShort,
  supplier: optionalShort,
  notes: optionalText,
});

export type MaterialInput = z.infer<typeof materialInputSchema>;

export const materialStatusUpdateSchema = z.object({
  material_id: requiredUuid,
  status: z.enum(MATERIAL_STATUSES),
});

/**
 * Bewegungs-Formular:
 * - `quantity` wird immer als positive Zahl eingegeben; der Server konvertiert
 *   das Vorzeichen anhand von `kind` und `direction` (bei adjustment).
 * - `direction` ist nur bei kind='adjustment' relevant ('increase' | 'decrease').
 */
export const movementInputSchema = z.object({
  material_id: requiredUuid,
  kind: z.enum(MOVEMENT_KINDS),
  quantity: z
    .coerce
    .number({ message: 'Menge als Zahl angeben.' })
    .positive('Menge muss größer 0 sein.'),
  direction: z.enum(['increase', 'decrease']).optional(),
  unit_cost_at_time: z
    .union([
      z.literal(''),
      z.coerce.number().nonnegative('Preis darf nicht negativ sein.'),
    ])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : (v as number))),
  property_id: optionalUuid,
  building_id: optionalUuid,
  unit_id: optionalUuid,
  work_order_id: optionalUuid,
  assignee_user_id: optionalUuid,
  // Sprint 113: Die Umrechnung stand vorher in der Server-Action
  // (`new Date(parsed.data.occurred_at).toISOString()`), also hinter dem
  // Schema und in der Prozess-Zeitzone. Jetzt liefert das Schema bereits den
  // fertigen Zeitpunkt.
  occurred_at: localDateTimeRequired('Zeitpunkt fehlt.', 'Ungültiges Datum.'),
  note: optionalText,
});

export type MovementInput = z.infer<typeof movementInputSchema>;

export const CATEGORY_LABEL: Record<MaterialCategory, string> = {
  cleaning: 'Reinigung',
  hardware: 'Werkzeug/Beschlag',
  safety: 'Arbeitsschutz',
  electric: 'Elektro',
  plumbing: 'Sanitär',
  paint: 'Farben/Lacke',
  garden: 'Garten',
  winter: 'Winterdienst',
  office: 'Büro',
  consumable: 'Verbrauch',
  other: 'Sonstiges',
};

export const STATUS_LABEL: Record<MaterialStatus, string> = {
  active: 'Aktiv',
  inactive: 'Inaktiv',
};

export const STATUS_TONE: Record<MaterialStatus, 'success' | 'muted'> = {
  active: 'success',
  inactive: 'muted',
};

export const KIND_LABEL: Record<MovementKind, string> = {
  receipt: 'Wareneingang',
  issue: 'Entnahme',
  adjustment: 'Korrektur',
  write_off: 'Abschreibung',
};

export const KIND_TONE: Record<MovementKind, 'success' | 'muted' | 'warning' | 'danger'> = {
  receipt: 'success',
  issue: 'muted',
  adjustment: 'warning',
  write_off: 'danger',
};
