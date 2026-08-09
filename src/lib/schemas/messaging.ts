import { z } from 'zod';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const requiredUuid = z
  .string()
  .trim()
  .min(1, 'ID fehlt.')
  .refine((v) => UUID_RE.test(v), 'Ungültige ID.');

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || UUID_RE.test(v), 'Ungültige ID.');

export const CONTEXT_TYPES = ['work_order', 'property', 'defect_report', 'tour', 'other'] as const;
export type ContextType = (typeof CONTEXT_TYPES)[number];

export const CONTEXT_TYPE_LABEL: Record<ContextType, string> = {
  work_order: 'Auftrag',
  property: 'Objekt',
  defect_report: 'Meldung',
  tour: 'Tour',
  other: 'Sonstiges',
};

export const threadCreateSchema = z.object({
  subject: z.string().trim().min(1, 'Betreff fehlt.').max(200),
  body: z.string().trim().min(1, 'Nachricht fehlt.').max(4000),
  participant_ids: z
    .array(requiredUuid)
    .min(1, 'Mindestens einen Empfänger auswählen.'),
  context_type: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine(
      (v) => v === null || (CONTEXT_TYPES as readonly string[]).includes(v),
      'Ungültiger Kontext.',
    ),
  context_id: optionalUuid,
});

export type ThreadCreateInput = z.infer<typeof threadCreateSchema>;

export const postMessageSchema = z.object({
  thread_id: requiredUuid,
  body: z.string().trim().min(1, 'Nachricht fehlt.').max(4000),
});

export const markReadSchema = z.object({
  thread_id: requiredUuid,
});

export const participantMutationSchema = z.object({
  thread_id: requiredUuid,
  user_id: requiredUuid,
});

export function formatMessageTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  return sameDay
    ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}
