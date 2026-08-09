'use client';

import { useState, useTransition } from 'react';
import { addParticipantAction, removeParticipantAction } from './actions';

type UserOption = { id: string; display_name: string | null };

export function AddParticipant({
  threadId,
  candidates,
}: {
  threadId: string;
  candidates: UserOption[];
}) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState('');

  if (candidates.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
        className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs"
      >
        <option value="">— Person hinzufügen —</option>
        {candidates.map((u) => (
          <option key={u.id} value={u.id}>
            {u.display_name ?? u.id.slice(0, 8)}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || !value}
        onClick={() => {
          const fd = new FormData();
          fd.set('thread_id', threadId);
          fd.set('user_id', value);
          const targetId = value;
          setValue('');
          start(async () => {
            try {
              await addParticipantAction(fd);
            } catch (err) {
              // rollback UI-only
              setValue(targetId);
              throw err;
            }
          });
        }}
        className="inline-flex h-7 items-center rounded-md bg-[var(--color-muted)] px-2 text-xs hover:opacity-80 disabled:opacity-40"
      >
        {pending ? '…' : 'Add'}
      </button>
    </div>
  );
}

export function RemoveParticipantButton({
  threadId,
  userId,
  label,
}: {
  threadId: string;
  userId: string;
  label: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`${label} aus dem Thread entfernen?`)) return;
        const fd = new FormData();
        fd.set('thread_id', threadId);
        fd.set('user_id', userId);
        start(async () => {
          await removeParticipantAction(fd);
        });
      }}
      className="text-xs text-[var(--color-destructive)] hover:underline disabled:opacity-40"
      title="Aus Thread entfernen"
    >
      {pending ? '…' : '×'}
    </button>
  );
}
