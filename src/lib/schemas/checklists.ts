import { z } from 'zod';

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

export const checklistTemplateInputSchema = z.object({
  title: z.string().trim().min(3, 'Titel ist erforderlich (mind. 3 Zeichen).').max(200),
  description: optionalText,
  category: optionalShort,
  active: z
    .string()
    .optional()
    .transform((v) => v === 'on' || v === 'true'),
});

export type ChecklistTemplateInput = z.infer<typeof checklistTemplateInputSchema>;

export const checklistItemKindSchema = z.enum(['check', 'text', 'number', 'photo']);
export type ChecklistItemKind = z.infer<typeof checklistItemKindSchema>;

const optionalNumber = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? Number(v) : null))
  .refine((v) => v === null || !Number.isNaN(v), 'Ungültige Zahl.');

export const checklistItemInputSchema = z
  .object({
    kind: checklistItemKindSchema.default('check'),
    label: z.string().trim().min(1, 'Bezeichnung ist erforderlich.').max(200),
    help_text: optionalText,
    required: z
      .string()
      .optional()
      .transform((v) => v === 'on' || v === 'true'),
    unit: optionalShort,
    min_value: optionalNumber,
    max_value: optionalNumber,
  })
  .superRefine((data, ctx) => {
    if (data.kind === 'number' && data.min_value !== null && data.max_value !== null) {
      if (data.min_value > data.max_value) {
        ctx.addIssue({
          code: 'custom',
          path: ['max_value'],
          message: 'Max muss größer als Min sein.',
        });
      }
    }
  });

export type ChecklistItemInput = z.infer<typeof checklistItemInputSchema>;

export const KIND_LABEL: Record<ChecklistItemKind, string> = {
  check: 'Ja/Nein-Häkchen',
  text: 'Freitext',
  number: 'Zahl / Messwert',
  photo: 'Foto-Nachweis',
};

export const KIND_HINT: Record<ChecklistItemKind, string> = {
  check: 'Einfache Sichtkontrolle mit Häkchen.',
  text: 'Kommentar oder Beobachtung.',
  number: 'Messwert mit optionaler Einheit (z. B. °C, bar).',
  photo: 'Foto-Nachweis der Prüfung.',
};

export type ChecklistRunStatus = 'in_progress' | 'completed' | 'cancelled';

export const RUN_STATUS_LABEL: Record<ChecklistRunStatus, string> = {
  in_progress: 'In Bearbeitung',
  completed: 'Abgeschlossen',
  cancelled: 'Abgebrochen',
};

export const RUN_STATUS_TONE: Record<ChecklistRunStatus, 'warning' | 'success' | 'muted'> = {
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'muted',
};

export type RunItem = {
  id: string;
  kind: string;
  required: boolean;
  value_bool: boolean | null;
  value_text: string | null;
  value_number: number | null;
  min_value: number | null;
  max_value: number | null;
};

/**
 * Ist ein Pflicht-Prüfpunkt „beantwortet"? — check: value_bool !== null,
 * text: value_text nicht leer, photo: mindestens ein Foto hochgeladen ODER
 * value_text (Legacy-Bemerkung), number: value_number gesetzt und
 * ggf. im Wertebereich. `docCount` ist die Anzahl der an das Item
 * angehängten Documents (nur für kind='photo' relevant).
 */
export function isRunItemAnswered(item: RunItem, docCount = 0): boolean {
  switch (item.kind) {
    case 'check':
      return item.value_bool !== null;
    case 'text':
      return item.value_text !== null && item.value_text.trim().length > 0;
    case 'photo':
      return (
        docCount > 0 ||
        (item.value_text !== null && item.value_text.trim().length > 0)
      );
    case 'number': {
      if (item.value_number === null || Number.isNaN(item.value_number)) return false;
      if (item.min_value !== null && item.value_number < item.min_value) return false;
      if (item.max_value !== null && item.value_number > item.max_value) return false;
      return true;
    }
    default:
      return false;
  }
}
