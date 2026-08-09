'use client';

import { useTransition } from 'react';
import { deleteInvoiceAction, deleteOfferAction, setInvoiceStatusAction, setOfferStatusAction } from './actions';
import type { InvoiceStatus, OfferStatus } from '@/lib/schemas/billing';

const OFFER_TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  draft: ['sent'],
  sent: ['accepted', 'declined', 'expired'],
  accepted: ['sent'],
  declined: ['sent'],
  expired: ['sent'],
};

const OFFER_LABEL: Record<OfferStatus, string> = {
  draft: 'Entwurf',
  sent: 'Versenden',
  accepted: 'Annehmen',
  declined: 'Ablehnen',
  expired: 'Als abgelaufen',
};

const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['paid', 'cancelled'],
  paid: ['sent'],
  cancelled: ['draft'],
};

const INVOICE_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Entwurf',
  sent: 'Versenden',
  paid: 'Bezahlt markieren',
  cancelled: 'Stornieren',
};

export function OfferStatusButtons({ id, current }: { id: string; current: OfferStatus }) {
  const [pending, start] = useTransition();
  const next = OFFER_TRANSITIONS[current];
  if (next.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {next.map((s) => (
        <button
          key={s}
          type="button"
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set('id', id);
            fd.set('status', s);
            start(async () => {
              await setOfferStatusAction(fd);
            });
          }}
          className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)] disabled:opacity-40"
        >
          {pending ? '…' : OFFER_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

export function InvoiceStatusButtons({ id, current }: { id: string; current: InvoiceStatus }) {
  const [pending, start] = useTransition();
  const next = INVOICE_TRANSITIONS[current];
  if (next.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {next.map((s) => (
        <button
          key={s}
          type="button"
          disabled={pending}
          onClick={() => {
            if (s === 'cancelled' && !confirm('Rechnung wirklich stornieren?')) return;
            const fd = new FormData();
            fd.set('id', id);
            fd.set('status', s);
            start(async () => {
              await setInvoiceStatusAction(fd);
            });
          }}
          className={`inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium disabled:opacity-40 ${
            s === 'paid'
              ? 'border-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_15%,transparent)] text-[var(--color-success)] hover:opacity-90'
              : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]'
          }`}
        >
          {pending ? '…' : INVOICE_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

export function DeleteDraftDocumentButton({ id, kind }: { id: string; kind: 'offer' | 'invoice' }) {
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
          if (kind === 'offer') await deleteOfferAction(fd);
          else await deleteInvoiceAction(fd);
        });
      }}
      className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-[var(--color-destructive)] hover:bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] disabled:opacity-40"
    >
      {pending ? '…' : 'Löschen'}
    </button>
  );
}
