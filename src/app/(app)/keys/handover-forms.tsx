'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { HOLDER_KINDS, HOLDER_KIND_LABEL } from '@/lib/schemas/keys';
import { issueKeyAction, returnKeyAction, markKeyLostAction, markKeyRetiredAction, recordKeyReplacedAction } from './actions';

type UserOption = { id: string; display_name: string | null };

export function IssueForm({
  keyId,
  users,
}: {
  keyId: string;
  users: UserOption[];
}) {
  const [holderKind, setHolderKind] = useState<(typeof HOLDER_KINDS)[number]>('employee');

  return (
    <form action={issueKeyAction} className="flex flex-col gap-3 p-4">
      <input type="hidden" name="key_id" value={keyId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Empfängertyp" htmlFor={`ho-kind-${keyId}`}>
          <Select
            id={`ho-kind-${keyId}`}
            name="holder_kind"
            value={holderKind}
            onChange={(e) => setHolderKind(e.target.value as (typeof HOLDER_KINDS)[number])}
          >
            {HOLDER_KINDS.map((k) => (
              <option key={k} value={k}>
                {HOLDER_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Anzahl Exemplare" htmlFor={`ho-count-${keyId}`}>
          <Input
            id={`ho-count-${keyId}`}
            name="copies_count"
            type="number"
            min={1}
            defaultValue={1}
            required
          />
        </Field>
      </div>

      {holderKind === 'employee' && users.length > 0 ? (
        <Field label="Benutzer" htmlFor={`ho-user-${keyId}`}>
          <Select id={`ho-user-${keyId}`} name="holder_user_id" defaultValue="">
            <option value="">— wählen —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name ?? u.id.slice(0, 8)}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor={`ho-name-${keyId}`} hint="Vor- und Nachname">
            <Input id={`ho-name-${keyId}`} name="holder_name" />
          </Field>
          <Field label="Kontakt" htmlFor={`ho-contact-${keyId}`} optional>
            <Input
              id={`ho-contact-${keyId}`}
              name="holder_contact"
              placeholder="Telefon oder E-Mail"
            />
          </Field>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Rückgabe erwartet bis" htmlFor={`ho-ret-${keyId}`} optional>
          <Input
            id={`ho-ret-${keyId}`}
            name="expected_return_at"
            type="datetime-local"
          />
        </Field>
        <Field label="Referenz Auftrag" htmlFor={`ho-wo-${keyId}`} optional>
          <Input
            id={`ho-wo-${keyId}`}
            name="reference_work_order_id"
            placeholder="UUID (optional)"
          />
        </Field>
      </div>

      <Field label="Notiz" htmlFor={`ho-note-${keyId}`} optional>
        <Textarea id={`ho-note-${keyId}`} name="note" rows={2} />
      </Field>

      <div className="flex justify-end">
        <Button type="submit">Ausgeben</Button>
      </div>
    </form>
  );
}

export function ReturnForm({
  issueHandoverId,
  maxCopies,
}: {
  issueHandoverId: string;
  maxCopies: number;
}) {
  return (
    <form action={returnKeyAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="issue_handover_id" value={issueHandoverId} />
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`ret-count-${issueHandoverId}`}
          className="text-xs text-[var(--color-muted-foreground)]"
        >
          Rückgabe (Exemplare)
        </label>
        <Input
          id={`ret-count-${issueHandoverId}`}
          name="copies_count"
          type="number"
          min={1}
          max={maxCopies}
          defaultValue={maxCopies}
          className="w-24"
          required
        />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <label
          htmlFor={`ret-note-${issueHandoverId}`}
          className="text-xs text-[var(--color-muted-foreground)]"
        >
          Notiz (optional)
        </label>
        <Input id={`ret-note-${issueHandoverId}`} name="note" />
      </div>
      <Button type="submit" variant="outline">
        Zurücknehmen
      </Button>
    </form>
  );
}

export function KeyStatusChangeForms({ keyId }: { keyId: string }) {
  return (
    <div className="flex flex-col gap-2">
      <details className="rounded-md border border-[var(--color-border)]">
        <summary className="cursor-pointer px-3 py-2 text-sm">→ Verlust melden</summary>
        <form action={markKeyLostAction} className="flex flex-col gap-2 p-3">
          <input type="hidden" name="key_id" value={keyId} />
          <Field label="Betroffene Exemplare" htmlFor={`lost-count-${keyId}`}>
            <Input
              id={`lost-count-${keyId}`}
              name="copies_count"
              type="number"
              min={1}
              defaultValue={1}
              required
            />
          </Field>
          <Field label="Notiz" htmlFor={`lost-note-${keyId}`} optional>
            <Textarea id={`lost-note-${keyId}`} name="note" rows={2} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="destructive">
              Als verloren markieren
            </Button>
          </div>
        </form>
      </details>

      <details className="rounded-md border border-[var(--color-border)]">
        <summary className="cursor-pointer px-3 py-2 text-sm">→ Nachfertigung erfassen</summary>
        <form action={recordKeyReplacedAction} className="flex flex-col gap-2 p-3">
          <input type="hidden" name="key_id" value={keyId} />
          <Field label="Nachgefertigte Exemplare" htmlFor={`rep-count-${keyId}`}>
            <Input
              id={`rep-count-${keyId}`}
              name="copies_count"
              type="number"
              min={1}
              defaultValue={1}
              required
            />
          </Field>
          <Field label="Notiz" htmlFor={`rep-note-${keyId}`} optional>
            <Textarea id={`rep-note-${keyId}`} name="note" rows={2} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit">Nachfertigung erfassen</Button>
          </div>
        </form>
      </details>

      <details className="rounded-md border border-[var(--color-border)]">
        <summary className="cursor-pointer px-3 py-2 text-sm">→ Ausmustern</summary>
        <form action={markKeyRetiredAction} className="flex flex-col gap-2 p-3">
          <input type="hidden" name="key_id" value={keyId} />
          <Field label="Notiz" htmlFor={`ret-note-${keyId}`} optional>
            <Textarea id={`ret-note-${keyId}`} name="note" rows={2} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="outline">
              Aus dem Verkehr ziehen
            </Button>
          </div>
        </form>
      </details>
    </div>
  );
}
