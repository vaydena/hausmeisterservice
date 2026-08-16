import { z } from 'zod';
import { ENTRY_KINDS } from './time-tracking';
import { localDateTimeOptional } from './datetime-local';

export const CORRECTION_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'] as const;
export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number];

export const CORRECTION_STATUS_LABEL: Record<CorrectionStatus, string> = {
  pending: 'Offen',
  approved: 'Genehmigt',
  rejected: 'Abgelehnt',
  withdrawn: 'Zurückgezogen',
};

export const CORRECTION_STATUS_TONE: Record<
  CorrectionStatus,
  'warning' | 'success' | 'danger' | 'muted'
> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  withdrawn: 'muted',
};

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine(
    (v) => v === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
    'Ungültige ID.',
  );

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));

// Sprint 113: Ein Korrekturantrag schlaegt eine andere Uhrzeit vor als die
// erfasste. Wurde der Vorschlag in einer anderen Zone gelesen als der
// Bestand, verglich die Genehmigung zwei Zahlen, die nicht zueinander
// gehoerten — und genehmigt wird hier Arbeitszeit.
const dateTimeLocalOptional = localDateTimeOptional('Ungültiges Datum.');

const optionalKind = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || (ENTRY_KINDS as readonly string[]).includes(v), 'Ungültige Art.');

export const createCorrectionSchema = z
  .object({
    time_entry_id: z.string().uuid('Ungültige Eintrags-ID.'),
    reason: z
      .string()
      .trim()
      .min(3, 'Begründung ist zu kurz.')
      .max(2000, 'Begründung ist zu lang.'),
    proposed_kind: optionalKind,
    proposed_start_at: dateTimeLocalOptional,
    proposed_end_at: dateTimeLocalOptional,
    proposed_work_order_id: optionalUuid,
    proposed_property_id: optionalUuid,
    proposed_note: optionalText(1000),

    /**
     * Explizite Flags, damit "leer machen" (null setzen) vom "unverändert lassen"
     * unterscheidbar ist. Ohne die würde eine leere Textbox einen Reset auslösen.
     */
    clear_work_order: z.enum(['on']).optional(),
    clear_property: z.enum(['on']).optional(),
    clear_note: z.enum(['on']).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.proposed_start_at &&
      data.proposed_end_at &&
      new Date(data.proposed_end_at) <= new Date(data.proposed_start_at)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['proposed_end_at'],
        message: 'Ende muss nach dem Start liegen.',
      });
    }
    const anyChange =
      data.proposed_kind !== null ||
      data.proposed_start_at !== null ||
      data.proposed_end_at !== null ||
      data.proposed_work_order_id !== null ||
      data.proposed_property_id !== null ||
      data.proposed_note !== null ||
      data.clear_work_order === 'on' ||
      data.clear_property === 'on' ||
      data.clear_note === 'on';
    if (!anyChange) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Bitte mindestens ein Feld ändern.',
      });
    }
  });

export const decideCorrectionSchema = z.object({
  correction_id: z.string().uuid('Ungültige Antrags-ID.'),
  status: z.enum(['approved', 'rejected']),
  decision_note: optionalText(2000),
});

export const withdrawCorrectionSchema = z.object({
  correction_id: z.string().uuid('Ungültige Antrags-ID.'),
});

export type CreateCorrectionInput = z.infer<typeof createCorrectionSchema>;
export type DecideCorrectionInput = z.infer<typeof decideCorrectionSchema>;

/**
 * Baut ein Diff-Objekt mit den Feldern, die geändert werden sollen. Aus dem
 * Ergebnis wird sowohl das Update auf time_entries als auch die UI-Anzeige
 * gespeist.
 */
export function correctionDiff(input: {
  proposed_kind: string | null;
  proposed_start_at: string | null;
  proposed_end_at: string | null;
  proposed_work_order_id: string | null;
  proposed_property_id: string | null;
  proposed_note: string | null;
}): Array<{ field: string; label: string }> {
  const out: Array<{ field: string; label: string }> = [];
  if (input.proposed_kind !== null) out.push({ field: 'kind', label: 'Art' });
  if (input.proposed_start_at !== null) out.push({ field: 'start_at', label: 'Beginn' });
  if (input.proposed_end_at !== null) out.push({ field: 'end_at', label: 'Ende' });
  if (input.proposed_work_order_id !== null) out.push({ field: 'work_order_id', label: 'Auftrag' });
  if (input.proposed_property_id !== null) out.push({ field: 'property_id', label: 'Objekt' });
  if (input.proposed_note !== null) out.push({ field: 'note', label: 'Notiz' });
  return out;
}
