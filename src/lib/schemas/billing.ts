import { z } from 'zod';
import { formatDateOnly } from '@/lib/utils/format';

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'muted';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const requiredUuid = z
  .string()
  .trim()
  .min(1, 'ID fehlt.')
  .refine((v) => UUID_RE.test(v), 'Ungültige ID.');

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || UUID_RE.test(v), 'Ungültige ID.');

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Ungültiges Datum.');

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

export const OFFER_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'expired'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  draft: 'Entwurf',
  sent: 'Verschickt',
  accepted: 'Angenommen',
  declined: 'Abgelehnt',
  expired: 'Abgelaufen',
};

export const OFFER_STATUS_TONE: Record<OfferStatus, BadgeTone> = {
  draft: 'muted',
  sent: 'primary',
  accepted: 'success',
  declined: 'danger',
  expired: 'muted',
};

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'cancelled'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Entwurf',
  sent: 'Verschickt',
  paid: 'Bezahlt',
  cancelled: 'Storniert',
};

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, BadgeTone> = {
  draft: 'muted',
  sent: 'warning',
  paid: 'success',
  cancelled: 'muted',
};

export const offerCreateSchema = z.object({
  title: z.string().trim().min(1, 'Titel fehlt.').max(200),
  description: optionalText,
  property_id: optionalUuid,
  owner_id: optionalUuid,
  bill_to_name: z.string().trim().min(1, 'Rechnungsempfänger fehlt.').max(200),
  bill_to_address: optionalText,
  issued_at: optionalDate,
  valid_until: optionalDate,
  notes: optionalText,
});

export type OfferCreateInput = z.infer<typeof offerCreateSchema>;

export const invoiceCreateSchema = z.object({
  title: z.string().trim().min(1, 'Titel fehlt.').max(200),
  description: optionalText,
  property_id: optionalUuid,
  owner_id: optionalUuid,
  work_order_id: optionalUuid,
  offer_id: optionalUuid,
  bill_to_name: z.string().trim().min(1, 'Rechnungsempfänger fehlt.').max(200),
  bill_to_address: optionalText,
  issued_at: optionalDate,
  due_at: optionalDate,
  notes: optionalText,
});

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;

export const lineItemSchema = z.object({
  description: z.string().trim().min(1, 'Beschreibung fehlt.').max(500),
  quantity: z.coerce.number().positive('Menge muss > 0 sein.'),
  unit: optionalText,
  unit_price_cents: z.coerce.number().int().min(0, 'Preis kann nicht negativ sein.'),
  tax_rate: z.coerce.number().min(0).max(99),
});

export type LineItemInput = z.infer<typeof lineItemSchema>;

export const documentIdSchema = z.object({
  id: requiredUuid,
});

export function computeLineTotals(item: {
  quantity: number;
  unit_price_cents: number;
  tax_rate: number;
}): { net_cents: number; tax_cents: number; gross_cents: number } {
  const net = Math.round(item.quantity * item.unit_price_cents);
  const tax = Math.round((net * item.tax_rate) / 100);
  return { net_cents: net, tax_cents: tax, gross_cents: net + tax };
}

export function computeDocumentTotals(
  items: Array<{ net_cents: number; tax_cents: number; gross_cents: number }>,
): { net_total_cents: number; tax_total_cents: number; gross_total_cents: number } {
  return items.reduce(
    (acc, i) => ({
      net_total_cents: acc.net_total_cents + i.net_cents,
      tax_total_cents: acc.tax_total_cents + i.tax_cents,
      gross_total_cents: acc.gross_total_cents + i.gross_cents,
    }),
    { net_total_cents: 0, tax_total_cents: 0, gross_total_cents: 0 },
  );
}

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  return (cents / 100).toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
  });
}

// Sprint 113: `issued_at` und `due_at` sind DATE-Spalten (siehe
// 20260803001300_billing.sql) — reine Kalenderdaten ohne Uhrzeit.
export function formatDate(iso: string | null | undefined): string {
  return formatDateOnly(iso);
}

export function isOverdue(dueAt: string | null | undefined, status: InvoiceStatus): boolean {
  if (status === 'paid' || status === 'cancelled') return false;
  if (!dueAt) return false;
  return dueAt < new Date().toISOString().slice(0, 10);
}
