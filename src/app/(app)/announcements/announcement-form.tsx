'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ANNOUNCEMENT_TARGET_LABEL,
  ANNOUNCEMENT_TARGET_TYPES,
  type AnnouncementTargetType,
} from '@/lib/schemas/announcements';
import type { AnnouncementFormState } from './actions';

const INITIAL: AnnouncementFormState = {};

type AnnouncementRecord = {
  id?: string;
  title?: string;
  body?: string;
  target_type?: AnnouncementTargetType;
  target_role_key?: string | null;
  target_user_ids?: string[] | null;
  requires_acknowledgement?: boolean;
  expires_at?: string | null;
};

type RoleOption = { key: string; name: string };
type UserOption = { id: string; display_name: string | null };

export function AnnouncementForm({
  action,
  cancelHref,
  submitLabel,
  roles,
  users,
  initial,
  showPublishToggle = false,
}: {
  action: (prev: AnnouncementFormState, form: FormData) => Promise<AnnouncementFormState>;
  cancelHref: string;
  submitLabel: string;
  roles: RoleOption[];
  users: UserOption[];
  initial?: AnnouncementRecord;
  showPublishToggle?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const err = state.fieldErrors ?? {};

  const [targetType, setTargetType] = useState<AnnouncementTargetType>(
    initial?.target_type ?? 'all',
  );
  const [selectedUsers, setSelectedUsers] = useState<string[]>(
    initial?.target_user_ids ?? [],
  );

  function toggleUser(id: string) {
    setSelectedUsers((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      <Card>
        <CardHeader>
          <CardTitle>Inhalt</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <Field label="Titel" htmlFor="title" error={err['title']}>
              <Input
                id="title"
                name="title"
                defaultValue={initial?.title ?? ''}
                required
                placeholder="z. B. Wartung Aufzug am 15.09."
                autoFocus
                maxLength={200}
              />
            </Field>
            <Field label="Text" htmlFor="body" error={err['body']}>
              <Textarea
                id="body"
                name="body"
                rows={6}
                defaultValue={initial?.body ?? ''}
                required
                placeholder="Beschreibung der Ankündigung …"
                maxLength={4000}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zielgruppe</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <Field label="An" htmlFor="target_type" error={err['target_type']}>
              <Select
                id="target_type"
                name="target_type"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as AnnouncementTargetType)}
              >
                {ANNOUNCEMENT_TARGET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ANNOUNCEMENT_TARGET_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>

            {targetType === 'role' && (
              <Field label="Rolle" htmlFor="target_role_key" error={err['target_role_key']}>
                <Select
                  id="target_role_key"
                  name="target_role_key"
                  defaultValue={initial?.target_role_key ?? ''}
                >
                  <option value="">— Rolle wählen —</option>
                  {roles.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {targetType === 'users' && (
              <Field
                label={`Personen (${selectedUsers.length} gewählt)`}
                htmlFor="target_user_ids"
                error={err['target_user_ids']}
              >
                <div className="flex flex-wrap gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-2">
                  {users.length === 0 ? (
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      Keine Mitarbeiter verfügbar.
                    </p>
                  ) : (
                    users.map((u) => {
                      const active = selectedUsers.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleUser(u.id)}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            active
                              ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                              : 'border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]'
                          }`}
                        >
                          {u.display_name ?? u.id.slice(0, 8)}
                        </button>
                      );
                    })
                  )}
                </div>
                {selectedUsers.map((id) => (
                  <input key={id} type="hidden" name="target_user_ids" value={id} />
                ))}
              </Field>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Ablauf" htmlFor="expires_at" optional error={err['expires_at']}>
                <Input
                  id="expires_at"
                  name="expires_at"
                  type="datetime-local"
                  defaultValue={
                    initial?.expires_at
                      ? new Date(initial.expires_at).toISOString().slice(0, 16)
                      : ''
                  }
                />
              </Field>
              <Field label="Optionen" htmlFor="requires_acknowledgement">
                <label className="flex h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    id="requires_acknowledgement"
                    name="requires_acknowledgement"
                    defaultChecked={initial?.requires_acknowledgement ?? false}
                    className="h-4 w-4"
                  />
                  Empfänger müssen aktiv bestätigen
                </label>
              </Field>
            </div>
          </div>
        </CardBody>
        <CardFooter>
          {state.error && (
            <p role="alert" className="mr-auto text-sm text-[var(--color-destructive)]">
              {state.error}
            </p>
          )}
          <Link
            href={cancelHref}
            className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            Abbrechen
          </Link>
          {showPublishToggle && (
            <label className="inline-flex h-10 items-center gap-2 text-sm">
              <input type="checkbox" name="_publish" className="h-4 w-4" />
              Direkt veröffentlichen
            </label>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? 'Speichern …' : submitLabel}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
