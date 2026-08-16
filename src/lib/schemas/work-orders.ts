import { z } from 'zod';
import { localDateTimeOptional } from './datetime-local';

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const optionalNumber = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? Number(v) : null))
  .refine((v) => v === null || (!Number.isNaN(v) && v > 0 && v < 10000), {
    message: 'Ungültige Anzahl.',
  });

// Sprint 113: Die Pruefung stand hier hinter dem Transform und kam damit zu
// spaet — `new Date('kaputt').toISOString()` wirft eine RangeError, und die
// faengt safeParse nicht. Ein POST mit unbrauchbarem planned_start hat also
// einen 500 erzeugt statt eines Feldfehlers.
const optionalDateTime = localDateTimeOptional('Ungültiges Datum.');

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine(
    (v) => v === null || /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v),
    'Ungültige ID.',
  );

export const workOrderInputSchema = z.object({
  title: z.string().trim().min(1, 'Titel ist erforderlich.').max(200),
  description: optionalText,
  category: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  priority: z.enum(['low', 'normal', 'high', 'emergency']).default('normal'),
  property_id: z
    .string()
    .trim()
    .min(1, 'Objekt ist erforderlich.')
    .refine(
      (v) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v),
      'Ungültige Objekt-ID.',
    ),
  building_id: optionalUuid,
  unit_id: optionalUuid,
  assignee_id: optionalUuid,
  planned_start: optionalDateTime,
  planned_end: optionalDateTime,
  deadline: optionalDateTime,
  estimated_minutes: optionalNumber,
  is_emergency: z
    .string()
    .optional()
    .transform((v) => v === 'on' || v === 'true'),
});

export type WorkOrderInput = z.infer<typeof workOrderInputSchema>;

export const workOrderStatusSchema = z.enum([
  'new',
  'planned',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
]);
export type WorkOrderStatus = z.infer<typeof workOrderStatusSchema>;

export const STATUS_ORDER: WorkOrderStatus[] = [
  'new',
  'planned',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
];

export const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  new: 'Neu',
  planned: 'Geplant',
  in_progress: 'In Arbeit',
  blocked: 'Blockiert',
  done: 'Erledigt',
  cancelled: 'Abgebrochen',
};

export const PRIORITY_LABEL: Record<WorkOrderInput['priority'], string> = {
  low: 'Niedrig',
  normal: 'Normal',
  high: 'Hoch',
  emergency: 'Notfall',
};
