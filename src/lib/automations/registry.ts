/**
 * Automations Registry — static list of triggers and actions supported by
 * the rule engine. UI + engine iterate this instead of magic strings.
 */

export const TRIGGER_KEYS = [
  'invoice.overdue',
  'invoice.due_soon',
  'maintenance.due_soon',
  'defect_report.created',
  'defect_report.status_changed',
  'work_order.assigned',
  'work_order.status_changed',
] as const;
export type TriggerKey = (typeof TRIGGER_KEYS)[number];

export interface TriggerDefinition {
  key: TriggerKey;
  labelDe: string;
  descriptionDe: string;
  /** Config-Felder, die die UI abfragt. */
  configFields: TriggerConfigField[];
}

export type TriggerConfigField =
  | {
      key: 'days_before';
      kind: 'int';
      labelDe: string;
      defaultValue: number;
      min: number;
      max: number;
    };

export const TRIGGERS: readonly TriggerDefinition[] = [
  {
    key: 'invoice.overdue',
    labelDe: 'Rechnung überfällig',
    descriptionDe:
      'Löst aus, wenn eine Rechnung im Status „Verschickt" ihr Zahlungsziel überschritten hat.',
    configFields: [],
  },
  {
    key: 'invoice.due_soon',
    labelDe: 'Rechnung wird fällig',
    descriptionDe:
      'Löst aus, wenn eine Rechnung im Status „Verschickt" in den nächsten X Tagen fällig wird.',
    configFields: [
      {
        key: 'days_before',
        kind: 'int',
        labelDe: 'Tage vorher',
        defaultValue: 3,
        min: 1,
        max: 60,
      },
    ],
  },
  {
    key: 'maintenance.due_soon',
    labelDe: 'Wartung wird fällig',
    descriptionDe: 'Löst aus, wenn ein aktiver Wartungsplan in X Tagen fällig wird.',
    configFields: [
      {
        key: 'days_before',
        kind: 'int',
        labelDe: 'Tage vorher',
        defaultValue: 7,
        min: 1,
        max: 90,
      },
    ],
  },
  {
    key: 'defect_report.created',
    labelDe: 'Neue Mängelmeldung',
    descriptionDe:
      'Löst einmalig aus, sobald eine neue Mängelmeldung eingeht (Meldungen, die vor Anlegen der Regel entstanden sind, werden ignoriert).',
    configFields: [],
  },
  {
    key: 'defect_report.status_changed',
    labelDe: 'Mängelmeldung Status geändert',
    descriptionDe:
      'Löst aus, sobald eine Mängelmeldung in einen der wichtigen Zustände wechselt: In Prüfung, Umgewandelt, Abgelehnt. Jeder Zustandswert wird pro Meldung einmal ausgelöst.',
    configFields: [],
  },
  {
    key: 'work_order.assigned',
    labelDe: 'Auftrag zugewiesen',
    descriptionDe:
      'Löst aus, sobald ein Auftrag einem Mitarbeiter zugewiesen wird (auch bei späterem Wechsel des Zuständigen). Zuweisungen vor Anlegen der Regel werden ignoriert.',
    configFields: [],
  },
  {
    key: 'work_order.status_changed',
    labelDe: 'Auftrag Status geändert',
    descriptionDe:
      'Löst aus, sobald ein Auftrag in einen der wichtigen Zustände wechselt: In Arbeit, Blockiert, Erledigt, Abgebrochen. Jeder Zustandswert wird pro Auftrag einmal ausgelöst.',
    configFields: [],
  },
];

export const TRIGGERS_BY_KEY: Record<TriggerKey, TriggerDefinition> = Object.fromEntries(
  TRIGGERS.map((t) => [t.key, t]),
) as Record<TriggerKey, TriggerDefinition>;

// -----------------------------------------------------------------------------

export const ACTION_KEYS = ['notify_users', 'notify_role', 'notify_assignee', 'send_email'] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

export const RECIPIENT_KINDS = ['users', 'role', 'addresses'] as const;
export type RecipientKind = (typeof RECIPIENT_KINDS)[number];

export interface ActionDefinition {
  key: ActionKey;
  labelDe: string;
  descriptionDe: string;
  configFields: ActionConfigField[];
}

export type ActionConfigField =
  | {
      key: 'user_ids';
      kind: 'user_multi';
      labelDe: string;
    }
  | {
      key: 'role_key';
      kind: 'role';
      labelDe: string;
    }
  | {
      key: 'recipient_kind';
      kind: 'recipient_kind';
      labelDe: string;
    }
  | {
      key: 'addresses';
      kind: 'email_multi';
      labelDe: string;
    };

export const ACTIONS: readonly ActionDefinition[] = [
  {
    key: 'notify_users',
    labelDe: 'Benutzer benachrichtigen',
    descriptionDe: 'Sendet eine In-App-Notification an ausgewählte Benutzer.',
    configFields: [
      { key: 'user_ids', kind: 'user_multi', labelDe: 'Empfänger' },
    ],
  },
  {
    key: 'notify_role',
    labelDe: 'Rolle benachrichtigen',
    descriptionDe: 'Sendet eine In-App-Notification an alle Träger:innen einer Rolle.',
    configFields: [
      { key: 'role_key', kind: 'role', labelDe: 'Rolle' },
    ],
  },
  {
    key: 'notify_assignee',
    labelDe: 'Zuständige/n benachrichtigen',
    descriptionDe:
      'Sendet eine In-App-Notification (und Push) an den zugewiesenen Benutzer des Vorgangs. Nur für Trigger sinnvoll, die eine Zuweisung mitliefern (z. B. „Auftrag zugewiesen").',
    configFields: [],
  },
  {
    key: 'send_email',
    labelDe: 'E-Mail versenden',
    descriptionDe:
      'Sendet eine E-Mail an ausgewählte Benutzer, eine Rolle oder freie Adressen (mit Deep-Link zum Vorgang).',
    configFields: [
      { key: 'recipient_kind', kind: 'recipient_kind', labelDe: 'Empfänger-Auswahl' },
      { key: 'user_ids', kind: 'user_multi', labelDe: 'Benutzer' },
      { key: 'role_key', kind: 'role', labelDe: 'Rolle' },
      { key: 'addresses', kind: 'email_multi', labelDe: 'Adressen (kommagetrennt)' },
    ],
  },
];

export const ACTIONS_BY_KEY: Record<ActionKey, ActionDefinition> = Object.fromEntries(
  ACTIONS.map((a) => [a.key, a]),
) as Record<ActionKey, ActionDefinition>;
