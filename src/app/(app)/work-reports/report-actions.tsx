'use client';

import { useTransition, type FormEvent } from 'react';
import { Check, RotateCcw, Trash2 } from 'lucide-react';
import {
  approveWorkReportAction,
  reopenWorkReportAction,
  softDeleteWorkReportAction,
} from './actions';

export function ApproveButton({ reportId }: { reportId: string }) {
  const [pending, startTransition] = useTransition();
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await approveWorkReportAction(formData);
    });
  }
  return (
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="report_id" value={reportId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:opacity-60"
      >
        <Check className="size-4" aria-hidden />
        {pending ? 'Wird freigegeben …' : 'Freigeben'}
      </button>
    </form>
  );
}

export function ReopenButton({ reportId }: { reportId: string }) {
  const [pending, startTransition] = useTransition();
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirm('Freigabe zurücknehmen? Der Bericht wird wieder bearbeitbar.')) return;
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await reopenWorkReportAction(formData);
    });
  }
  return (
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="report_id" value={reportId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--color-border)] px-4 text-sm font-medium text-[var(--color-muted-foreground)] transition hover:bg-[var(--color-muted)] disabled:opacity-60"
      >
        <RotateCcw className="size-4" aria-hidden />
        {pending ? 'Wird zurückgeholt …' : 'Zurück in Entwurf'}
      </button>
    </form>
  );
}

export function DeleteReportButton({ reportId, code }: { reportId: string; code: string | null }) {
  const [pending, startTransition] = useTransition();
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirm(`Entwurf ${code ?? ''} löschen? Das lässt sich nicht rückgängig machen.`)) return;
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await softDeleteWorkReportAction(formData);
    });
  }
  return (
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="report_id" value={reportId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--color-border)] px-4 text-sm font-medium text-[var(--color-muted-foreground)] transition hover:border-[var(--color-destructive)] hover:text-[var(--color-destructive)] disabled:opacity-60"
      >
        <Trash2 className="size-4" aria-hidden />
        {pending ? 'Wird gelöscht …' : 'Entwurf löschen'}
      </button>
    </form>
  );
}
