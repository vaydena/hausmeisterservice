import { z } from 'zod';

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

const optionalIdentifier = z
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

export const KEY_KINDS = ['main', 'apartment', 'mailbox', 'basement', 'technical', 'gate', 'transponder', 'other'] as const;
export type KeyKind = (typeof KEY_KINDS)[number];

export const KEY_STATUSES = ['active', 'lost', 'retired'] as const;
export type KeyStatus = (typeof KEY_STATUSES)[number];

export const keyInputSchema = z.object({
  label: z.string().trim().min(1, 'Bitte Bezeichnung angeben.').max(200),
  identifier: optionalIdentifier,
  kind: z.enum(KEY_KINDS).default('other'),
  property_id: requiredUuid,
  building_id: optionalUuid,
  unit_id: optionalUuid,
  copies_total: z.coerce.number().int().min(1, 'Mindestens 1 Exemplar.').max(999).default(1),
  storage_location: optionalShort,
  notes: optionalText,
});

export type KeyInput = z.infer<typeof keyInputSchema>;

export const keyStatusUpdateSchema = z.object({
  key_id: requiredUuid,
  status: z.enum(KEY_STATUSES),
});

export const HOLDER_KINDS = ['employee', 'resident', 'owner', 'external'] as const;
export type HolderKind = (typeof HOLDER_KINDS)[number];

export const issueSchema = z
  .object({
    key_id: requiredUuid,
    holder_kind: z.enum(HOLDER_KINDS),
    holder_user_id: optionalUuid,
    holder_name: optionalShort,
    holder_contact: optionalShort,
    expected_return_at: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    copies_count: z.coerce.number().int().min(1).max(999).default(1),
    reference_work_order_id: optionalUuid,
    note: optionalText,
  })
  .refine((data) => data.holder_user_id !== null || data.holder_name !== null, {
    message: 'Bitte Benutzer wählen oder Namen angeben.',
    path: ['holder_name'],
  });

export type IssueInput = z.infer<typeof issueSchema>;

export const returnSchema = z.object({
  issue_handover_id: requiredUuid,
  copies_count: z.coerce.number().int().min(1).max(999).default(1),
  note: optionalText,
});

export type ReturnInput = z.infer<typeof returnSchema>;

export const lostSchema = z.object({
  key_id: requiredUuid,
  copies_count: z.coerce.number().int().min(1).max(999).default(1),
  note: optionalText,
});

export const retiredSchema = z.object({
  key_id: requiredUuid,
  note: optionalText,
});

export const replacedSchema = z.object({
  key_id: requiredUuid,
  copies_count: z.coerce.number().int().min(1).max(999).default(1),
  note: optionalText,
});

export const KIND_LABEL: Record<KeyKind, string> = {
  main: 'Hauptschlüssel',
  apartment: 'Wohnungsschlüssel',
  mailbox: 'Briefkasten',
  basement: 'Keller',
  technical: 'Technikraum',
  gate: 'Tor/Einfahrt',
  transponder: 'Transponder/Chip',
  other: 'Sonstiger',
};

export const STATUS_LABEL: Record<KeyStatus, string> = {
  active: 'Aktiv',
  lost: 'Verloren',
  retired: 'Ausgemustert',
};

export const STATUS_TONE: Record<KeyStatus, 'success' | 'danger' | 'muted'> = {
  active: 'success',
  lost: 'danger',
  retired: 'muted',
};

export const HANDOVER_KIND_LABEL: Record<
  'issue' | 'return' | 'lost' | 'retired' | 'replaced',
  string
> = {
  issue: 'Ausgabe',
  return: 'Rückgabe',
  lost: 'Verlust',
  retired: 'Ausgemustert',
  replaced: 'Nachfertigung',
};

export const HOLDER_KIND_LABEL: Record<HolderKind, string> = {
  employee: 'Mitarbeiter',
  resident: 'Bewohner',
  owner: 'Eigentümer',
  external: 'Extern',
};
