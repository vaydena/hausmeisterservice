'use client';

import { useTransition } from 'react';
import {
  acknowledgeAnnouncementAction,
  closeAnnouncementAction,
  deleteAnnouncementAction,
  publishAnnouncementAction,
} from './actions';

export function PublishButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const fd = new FormData();
        fd.set('id', id);
        start(async () => {
          await publishAnnouncementAction(fd);
        });
      }}
      className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
    >
      {pending ? 'Veröffentlichen …' : 'Veröffentlichen'}
    </button>
  );
}

export function CloseButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm('Ankündigung schließen? Sie ist danach nicht mehr aktiv.')) return;
        const fd = new FormData();
        fd.set('id', id);
        start(async () => {
          await closeAnnouncementAction(fd);
        });
      }}
      className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)] disabled:opacity-40"
    >
      {pending ? '…' : 'Schließen'}
    </button>
  );
}

export function DeleteDraftButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm('Entwurf löschen?')) return;
        const fd = new FormData();
        fd.set('id', id);
        start(async () => {
          await deleteAnnouncementAction(fd);
        });
      }}
      className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-[var(--color-destructive)] hover:bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] disabled:opacity-40"
    >
      {pending ? '…' : 'Löschen'}
    </button>
  );
}

export function AcknowledgeButton({
  id,
  alreadyAcknowledged,
}: {
  id: string;
  alreadyAcknowledged: boolean;
}) {
  const [pending, start] = useTransition();
  if (alreadyAcknowledged) {
    return (
      <div className="inline-flex h-9 items-center rounded-md bg-[color-mix(in_srgb,var(--color-success)_15%,transparent)] px-3 text-sm font-medium text-[var(--color-success)]">
        Bestätigt
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const fd = new FormData();
        fd.set('id', id);
        start(async () => {
          await acknowledgeAnnouncementAction(fd);
        });
      }}
      className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
    >
      {pending ? 'Bestätigen …' : 'Zur Kenntnis genommen'}
    </button>
  );
}

