'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ACTIONS,
  TRIGGERS,
  type ActionKey,
  type RecipientKind,
  type TriggerKey,
} from '@/lib/automations/registry';
import { createAutomationRuleAction, type AutomationFormState } from '../actions';

const INITIAL: AutomationFormState = { ok: false, message: null, fieldErrors: {} };

interface Props {
  members: { id: string; label: string }[];
  roles: { key: string; label: string }[];
}

export function RuleForm({ members, roles }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createAutomationRuleAction, INITIAL);
  const [triggerKey, setTriggerKey] = useState<TriggerKey>('invoice.overdue');
  const [actionKey, setActionKey] = useState<ActionKey>('notify_users');
  const [recipientKind, setRecipientKind] = useState<RecipientKind>('users');

  const triggerDef = TRIGGERS.find((t) => t.key === triggerKey);
  const actionDef = ACTIONS.find((a) => a.key === actionKey);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div>
        <label htmlFor="name" className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
          Name der Regel *
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={120}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
          placeholder="z. B. Wochenerinnerung überfällige Rechnungen"
        />
        {state.fieldErrors['name'] && (
          <p className="mt-1 text-xs text-[var(--color-destructive)]">{state.fieldErrors['name']}</p>
        )}
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
          Beschreibung (optional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
        />
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] p-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Trigger
        </h3>
        <select
          name="trigger_key"
          value={triggerKey}
          onChange={(e) => setTriggerKey(e.target.value as TriggerKey)}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
        >
          {TRIGGERS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.labelDe}
            </option>
          ))}
        </select>
        {triggerDef && (
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            {triggerDef.descriptionDe}
          </p>
        )}
        {triggerDef?.configFields.map((field) => {
          if (field.key === 'days_before') {
            return (
              <div key={field.key} className="mt-3">
                <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
                  {field.labelDe}
                </label>
                <input
                  type="number"
                  name="trigger_config.days_before"
                  min={field.min}
                  max={field.max}
                  defaultValue={field.defaultValue}
                  className="w-32 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
                {state.fieldErrors['trigger_config.days_before'] && (
                  <p className="mt-1 text-xs text-[var(--color-destructive)]">
                    {state.fieldErrors['trigger_config.days_before']}
                  </p>
                )}
              </div>
            );
          }
          return null;
        })}
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] p-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Aktion
        </h3>
        <select
          name="action_key"
          value={actionKey}
          onChange={(e) => setActionKey(e.target.value as ActionKey)}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
        >
          {ACTIONS.map((a) => (
            <option key={a.key} value={a.key}>
              {a.labelDe}
            </option>
          ))}
        </select>
        {actionDef && (
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">{actionDef.descriptionDe}</p>
        )}

        {actionKey === 'notify_users' && (
          <div className="mt-3">
            <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
              Empfänger *
            </label>
            <select
              name="action_config.user_ids"
              multiple
              size={Math.min(6, Math.max(3, members.length))}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              Strg/Cmd halten für Mehrfachauswahl.
            </p>
            {state.fieldErrors['action_config.user_ids'] && (
              <p className="mt-1 text-xs text-[var(--color-destructive)]">
                {state.fieldErrors['action_config.user_ids']}
              </p>
            )}
          </div>
        )}

        {actionKey === 'notify_role' && (
          <div className="mt-3">
            <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">Rolle *</label>
            <select
              name="action_config.role_key"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            >
              <option value="">— bitte wählen —</option>
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
            {state.fieldErrors['action_config.role_key'] && (
              <p className="mt-1 text-xs text-[var(--color-destructive)]">
                {state.fieldErrors['action_config.role_key']}
              </p>
            )}
          </div>
        )}

        {actionKey === 'send_email' && (
          <>
            <div className="mt-3">
              <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
                Empfänger-Auswahl *
              </label>
              <select
                name="action_config.recipient_kind"
                value={recipientKind}
                onChange={(e) => setRecipientKind(e.target.value as RecipientKind)}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                <option value="users">Ausgewählte Benutzer</option>
                <option value="role">Alle Träger:innen einer Rolle</option>
                <option value="addresses">Freie E-Mail-Adressen</option>
              </select>
              {state.fieldErrors['action_config.recipient_kind'] && (
                <p className="mt-1 text-xs text-[var(--color-destructive)]">
                  {state.fieldErrors['action_config.recipient_kind']}
                </p>
              )}
            </div>

            {recipientKind === 'users' && (
              <div className="mt-3">
                <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
                  Benutzer *
                </label>
                <select
                  name="action_config.user_ids"
                  multiple
                  size={Math.min(6, Math.max(3, members.length))}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                  Strg/Cmd halten für Mehrfachauswahl. Nur Benutzer mit hinterlegter E-Mail
                  bekommen die Mail.
                </p>
                {state.fieldErrors['action_config.user_ids'] && (
                  <p className="mt-1 text-xs text-[var(--color-destructive)]">
                    {state.fieldErrors['action_config.user_ids']}
                  </p>
                )}
              </div>
            )}

            {recipientKind === 'role' && (
              <div className="mt-3">
                <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
                  Rolle *
                </label>
                <select
                  name="action_config.role_key"
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                >
                  <option value="">— bitte wählen —</option>
                  {roles.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {state.fieldErrors['action_config.role_key'] && (
                  <p className="mt-1 text-xs text-[var(--color-destructive)]">
                    {state.fieldErrors['action_config.role_key']}
                  </p>
                )}
              </div>
            )}

            {recipientKind === 'addresses' && (
              <div className="mt-3">
                <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
                  E-Mail-Adressen (Komma / Leerzeichen getrennt) *
                </label>
                <textarea
                  name="action_config.addresses"
                  rows={2}
                  placeholder="buchhaltung@example.com, hausmeister@example.com"
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
                {state.fieldErrors['action_config.addresses'] && (
                  <p className="mt-1 text-xs text-[var(--color-destructive)]">
                    {state.fieldErrors['action_config.addresses']}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked />
        <span>Regel direkt aktivieren</span>
      </label>

      {state.message && !state.ok && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.message}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-3">
        <button
          type="button"
          onClick={() => router.push('/settings/automations')}
          className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-60"
        >
          {pending ? 'Speichern…' : 'Anlegen'}
        </button>
      </div>
    </form>
  );
}
