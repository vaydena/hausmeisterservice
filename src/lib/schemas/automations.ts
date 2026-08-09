import { z } from 'zod';
import { ACTION_KEYS, RECIPIENT_KINDS, TRIGGER_KEYS } from '@/lib/automations/registry';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const triggerKeyEnum = z.enum(TRIGGER_KEYS);
export const actionKeyEnum = z.enum(ACTION_KEYS);
export const recipientKindEnum = z.enum(RECIPIENT_KINDS);

export const triggerConfigSchema = z
  .object({
    days_before: z.coerce.number().int().min(1).max(90).optional(),
  })
  .strict()
  .default({});

export type TriggerConfig = z.infer<typeof triggerConfigSchema>;

export const actionConfigSchema = z
  .object({
    user_ids: z
      .array(z.string().regex(UUID_RE, 'Ungültige Benutzer-ID.'))
      .optional(),
    role_key: z.string().trim().min(1).max(60).optional(),
    recipient_kind: recipientKindEnum.optional(),
    addresses: z
      .array(z.string().trim().regex(EMAIL_RE, 'Ungültige E-Mail-Adresse.'))
      .max(50)
      .optional(),
  })
  .strict()
  .default({});

export type ActionConfig = z.infer<typeof actionConfigSchema>;

export const automationRuleCreateSchema = z
  .object({
    name: z.string().trim().min(1, 'Name fehlt.').max(120),
    description: z.string().trim().max(1000).optional().nullable(),
    trigger_key: triggerKeyEnum,
    trigger_config: triggerConfigSchema,
    action_key: actionKeyEnum,
    action_config: actionConfigSchema,
    enabled: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.action_key === 'notify_users') {
      if (!val.action_config.user_ids || val.action_config.user_ids.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'Bitte mindestens einen Empfänger auswählen.',
          path: ['action_config', 'user_ids'],
        });
      }
    }
    if (val.action_key === 'notify_role') {
      if (!val.action_config.role_key) {
        ctx.addIssue({
          code: 'custom',
          message: 'Bitte eine Rolle wählen.',
          path: ['action_config', 'role_key'],
        });
      }
    }
    if (val.action_key === 'notify_assignee') {
      const supported = ['work_order.assigned', 'work_order.status_changed'] as const;
      if (!supported.includes(val.trigger_key as (typeof supported)[number])) {
        ctx.addIssue({
          code: 'custom',
          message: '„Zuständige/n benachrichtigen" ist nur für Auftrags-Trigger sinnvoll (Zuweisung / Statuswechsel).',
          path: ['action_key'],
        });
      }
    }
    if (val.action_key === 'send_email') {
      const kind = val.action_config.recipient_kind;
      if (!kind) {
        ctx.addIssue({
          code: 'custom',
          message: 'Bitte Empfänger-Auswahl festlegen.',
          path: ['action_config', 'recipient_kind'],
        });
      } else if (kind === 'users') {
        if (!val.action_config.user_ids || val.action_config.user_ids.length === 0) {
          ctx.addIssue({
            code: 'custom',
            message: 'Bitte mindestens einen Benutzer wählen.',
            path: ['action_config', 'user_ids'],
          });
        }
      } else if (kind === 'role') {
        if (!val.action_config.role_key) {
          ctx.addIssue({
            code: 'custom',
            message: 'Bitte eine Rolle wählen.',
            path: ['action_config', 'role_key'],
          });
        }
      } else if (kind === 'addresses') {
        if (!val.action_config.addresses || val.action_config.addresses.length === 0) {
          ctx.addIssue({
            code: 'custom',
            message: 'Bitte mindestens eine E-Mail-Adresse angeben.',
            path: ['action_config', 'addresses'],
          });
        }
      }
    }
    if (
      (val.trigger_key === 'invoice.due_soon' || val.trigger_key === 'maintenance.due_soon') &&
      !val.trigger_config.days_before
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Bitte „Tage vorher" angeben.',
        path: ['trigger_config', 'days_before'],
      });
    }
  });

export type AutomationRuleCreateInput = z.infer<typeof automationRuleCreateSchema>;

/**
 * Parsen der jsonb-Felder mit Fallback. Wird beim Lesen aus der DB genutzt.
 */
export function parseTriggerConfig(raw: unknown): TriggerConfig {
  const result = triggerConfigSchema.safeParse(raw ?? {});
  return result.success ? result.data : {};
}

export function parseActionConfig(raw: unknown): ActionConfig {
  const result = actionConfigSchema.safeParse(raw ?? {});
  return result.success ? result.data : {};
}
