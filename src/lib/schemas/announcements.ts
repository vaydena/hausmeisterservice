import { z } from 'zod';

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'muted';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const requiredUuid = z
  .string()
  .trim()
  .min(1, 'ID fehlt.')
  .refine((v) => UUID_RE.test(v), 'Ungültige ID.');

export const ANNOUNCEMENT_TARGET_TYPES = ['all', 'role', 'users', 'residents', 'property'] as const;
export type AnnouncementTargetType = (typeof ANNOUNCEMENT_TARGET_TYPES)[number];

export const ANNOUNCEMENT_TARGET_LABEL: Record<AnnouncementTargetType, string> = {
  all: 'Alle (Mitarbeiter + Bewohner)',
  role: 'Nach Mitarbeiter-Rolle',
  users: 'Ausgewählte Personen',
  residents: 'Alle Bewohner',
  property: 'Bewohner eines Objekts',
};

export const ANNOUNCEMENT_STATUSES = ['draft', 'published', 'closed'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const ANNOUNCEMENT_STATUS_LABEL: Record<AnnouncementStatus, string> = {
  draft: 'Entwurf',
  published: 'Veröffentlicht',
  closed: 'Geschlossen',
};

export const ANNOUNCEMENT_STATUS_TONE: Record<AnnouncementStatus, BadgeTone> = {
  draft: 'muted',
  published: 'success',
  closed: 'neutral',
};

const bodyText = z.string().trim().min(1, 'Text fehlt.').max(4000);
const titleText = z.string().trim().min(1, 'Titel fehlt.').max(200);

const targetRoleKey = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const targetUserIds = z
  .array(requiredUuid)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const expiresAt = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine(
    (v) => v === null || !Number.isNaN(new Date(v).getTime()),
    'Ungültiges Ablaufdatum.',
  );

const requiresAck = z
  .union([z.literal('on'), z.literal('true'), z.literal('false'), z.literal('')])
  .optional()
  .transform((v) => v === 'on' || v === 'true');

export const announcementCreateSchema = z
  .object({
    title: titleText,
    body: bodyText,
    target_type: z.enum(ANNOUNCEMENT_TARGET_TYPES),
    target_role_key: targetRoleKey,
    target_user_ids: targetUserIds,
    requires_acknowledgement: requiresAck,
    expires_at: expiresAt,
  })
  .superRefine((data, ctx) => {
    if (data.target_type === 'role' && !data.target_role_key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target_role_key'],
        message: 'Rolle auswählen.',
      });
    }
    if (data.target_type === 'users' && (!data.target_user_ids || data.target_user_ids.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target_user_ids'],
        message: 'Mindestens eine Person auswählen.',
      });
    }
    if (data.target_type === 'all' && (data.target_role_key || data.target_user_ids)) {
      // saubere Zielangabe erzwingen
      if (data.target_role_key) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['target_role_key'],
          message: 'Rolle bei „Alle" leer lassen.',
        });
      }
    }
  });

export type AnnouncementCreateInput = z.infer<typeof announcementCreateSchema>;

export const announcementUpdateSchema = announcementCreateSchema;

export const announcementIdSchema = z.object({
  id: requiredUuid,
});

export function formatAnnouncementDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatAnnouncementDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}
