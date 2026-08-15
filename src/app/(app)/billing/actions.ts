'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import {
  computeDocumentTotals,
  computeLineTotals,
  documentIdSchema,
  invoiceCreateSchema,
  lineItemSchema,
  offerCreateSchema,
  type OfferStatus,
  type InvoiceStatus,
} from '@/lib/schemas/billing';

export type BillingFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function fieldErrorsFromZod(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

function friendlyDbMessage(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für diese Aktion.';
  if (msg.includes('violates foreign key')) return 'Verweis ist ungültig.';
  if (msg.includes('offers_code_tenant_unique') || msg.includes('invoices_code_tenant_unique'))
    return 'Beleg-Nummer bereits vergeben.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

// ================================================================
// Offers
// ================================================================

export async function createOfferAction(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const ctx = await requireTenantContext();
  const parsed = offerCreateSchema.safeParse({
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? undefined,
    property_id: formData.get('property_id') ?? undefined,
    owner_id: formData.get('owner_id') ?? undefined,
    bill_to_name: formData.get('bill_to_name') ?? '',
    bill_to_address: formData.get('bill_to_address') ?? undefined,
    issued_at: formData.get('issued_at') ?? undefined,
    valid_until: formData.get('valid_until') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  });
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const inserted = await supabase
    .from('offers')
    .insert({
      code: '',
      tenant_id: ctx.tenantId,
      title: parsed.data.title,
      description: parsed.data.description,
      property_id: parsed.data.property_id,
      owner_id: parsed.data.owner_id,
      bill_to_name: parsed.data.bill_to_name,
      bill_to_address: parsed.data.bill_to_address,
      issued_at: parsed.data.issued_at,
      valid_until: parsed.data.valid_until,
      notes: parsed.data.notes,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single();
  if (inserted.error || !inserted.data) return { error: friendlyDbMessage(inserted.error?.message) };

  revalidatePath('/billing/offers');
  redirect(`/billing/offers/${inserted.data.id}`);
}

export async function updateOfferAction(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const ctx = await requireTenantContext();
  const idResult = documentIdSchema.safeParse({ id: formData.get('id') });
  if (!idResult.success) return { error: 'Ungültige ID.' };

  const parsed = offerCreateSchema.safeParse({
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? undefined,
    property_id: formData.get('property_id') ?? undefined,
    owner_id: formData.get('owner_id') ?? undefined,
    bill_to_name: formData.get('bill_to_name') ?? '',
    bill_to_address: formData.get('bill_to_address') ?? undefined,
    issued_at: formData.get('issued_at') ?? undefined,
    valid_until: formData.get('valid_until') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  });
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('offers')
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      property_id: parsed.data.property_id,
      owner_id: parsed.data.owner_id,
      bill_to_name: parsed.data.bill_to_name,
      bill_to_address: parsed.data.bill_to_address,
      issued_at: parsed.data.issued_at,
      valid_until: parsed.data.valid_until,
      notes: parsed.data.notes,
      updated_by: ctx.userId,
    })
    .eq('id', idResult.data.id);
  if (error) return { error: friendlyDbMessage(error.message) };

  revalidatePath(`/billing/offers/${idResult.data.id}`);
  redirect(`/billing/offers/${idResult.data.id}`);
}

export async function setOfferStatusAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const idResult = documentIdSchema.safeParse({ id: formData.get('id') });
  if (!idResult.success) throw new Error('Ungültige ID.');
  const status = String(formData.get('status') ?? '') as OfferStatus;
  const validStatuses: OfferStatus[] = ['draft', 'sent', 'accepted', 'declined', 'expired'];
  if (!validStatuses.includes(status)) throw new Error('Ungültiger Status.');

  const supabase = await createSupabaseServerClient();
  const patch: { status: OfferStatus; updated_by: string; issued_at?: string } = {
    status,
    updated_by: ctx.userId,
  };
  if (status === 'sent') patch.issued_at = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from('offers').update(patch).eq('id', idResult.data.id);
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/billing/offers');
  revalidatePath(`/billing/offers/${idResult.data.id}`);
}

export async function deleteOfferAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const idResult = documentIdSchema.safeParse({ id: formData.get('id') });
  if (!idResult.success) throw new Error('Ungültige ID.');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('offers').delete().eq('id', idResult.data.id).eq('status', 'draft');
  if (error) throw new Error(friendlyDbMessage(error.message));
  revalidatePath('/billing/offers');
  redirect('/billing/offers');
}

// ================================================================
// Invoices
// ================================================================

export async function createInvoiceAction(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const ctx = await requireTenantContext();
  const parsed = invoiceCreateSchema.safeParse({
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? undefined,
    property_id: formData.get('property_id') ?? undefined,
    owner_id: formData.get('owner_id') ?? undefined,
    work_order_id: formData.get('work_order_id') ?? undefined,
    offer_id: formData.get('offer_id') ?? undefined,
    bill_to_name: formData.get('bill_to_name') ?? '',
    bill_to_address: formData.get('bill_to_address') ?? undefined,
    issued_at: formData.get('issued_at') ?? undefined,
    due_at: formData.get('due_at') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  });
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const inserted = await supabase
    .from('invoices')
    .insert({
      code: '',
      tenant_id: ctx.tenantId,
      title: parsed.data.title,
      description: parsed.data.description,
      property_id: parsed.data.property_id,
      owner_id: parsed.data.owner_id,
      work_order_id: parsed.data.work_order_id,
      offer_id: parsed.data.offer_id,
      bill_to_name: parsed.data.bill_to_name,
      bill_to_address: parsed.data.bill_to_address,
      issued_at: parsed.data.issued_at,
      due_at: parsed.data.due_at,
      notes: parsed.data.notes,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single();
  if (inserted.error || !inserted.data) return { error: friendlyDbMessage(inserted.error?.message) };

  revalidatePath('/billing/invoices');
  redirect(`/billing/invoices/${inserted.data.id}`);
}

export async function updateInvoiceAction(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const ctx = await requireTenantContext();
  const idResult = documentIdSchema.safeParse({ id: formData.get('id') });
  if (!idResult.success) return { error: 'Ungültige ID.' };

  const parsed = invoiceCreateSchema.safeParse({
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? undefined,
    property_id: formData.get('property_id') ?? undefined,
    owner_id: formData.get('owner_id') ?? undefined,
    work_order_id: formData.get('work_order_id') ?? undefined,
    offer_id: formData.get('offer_id') ?? undefined,
    bill_to_name: formData.get('bill_to_name') ?? '',
    bill_to_address: formData.get('bill_to_address') ?? undefined,
    issued_at: formData.get('issued_at') ?? undefined,
    due_at: formData.get('due_at') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  });
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('invoices')
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      property_id: parsed.data.property_id,
      owner_id: parsed.data.owner_id,
      work_order_id: parsed.data.work_order_id,
      offer_id: parsed.data.offer_id,
      bill_to_name: parsed.data.bill_to_name,
      bill_to_address: parsed.data.bill_to_address,
      issued_at: parsed.data.issued_at,
      due_at: parsed.data.due_at,
      notes: parsed.data.notes,
      updated_by: ctx.userId,
    })
    .eq('id', idResult.data.id);
  if (error) return { error: friendlyDbMessage(error.message) };

  revalidatePath(`/billing/invoices/${idResult.data.id}`);
  redirect(`/billing/invoices/${idResult.data.id}`);
}

export async function setInvoiceStatusAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const idResult = documentIdSchema.safeParse({ id: formData.get('id') });
  if (!idResult.success) throw new Error('Ungültige ID.');
  const status = String(formData.get('status') ?? '') as InvoiceStatus;
  const validStatuses: InvoiceStatus[] = ['draft', 'sent', 'paid', 'cancelled'];
  if (!validStatuses.includes(status)) throw new Error('Ungültiger Status.');

  const supabase = await createSupabaseServerClient();
  const patch: {
    status: InvoiceStatus;
    updated_by: string;
    issued_at?: string;
    paid_at?: string | null;
  } = {
    status,
    updated_by: ctx.userId,
  };
  const today = new Date().toISOString().slice(0, 10);
  if (status === 'sent') patch.issued_at = today;
  if (status === 'paid') patch.paid_at = today;
  else patch.paid_at = null;
  const { error } = await supabase.from('invoices').update(patch).eq('id', idResult.data.id);
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/billing/invoices');
  revalidatePath(`/billing/invoices/${idResult.data.id}`);
}

export async function deleteInvoiceAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const idResult = documentIdSchema.safeParse({ id: formData.get('id') });
  if (!idResult.success) throw new Error('Ungültige ID.');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', idResult.data.id)
    .eq('status', 'draft');
  if (error) throw new Error(friendlyDbMessage(error.message));
  revalidatePath('/billing/invoices');
  redirect('/billing/invoices');
}

// ================================================================
// Line items
// ================================================================

/**
 * Sprint 107: Die teuerste Stelle des Moduls.
 *
 * Vorher stand hier `computeDocumentTotals(items ?? [])`. Scheiterte die
 * Positionen-Query, wurde aus einer leeren Liste gerechnet — und das Ergebnis
 * (0/0/0) anschliessend in den Beleg GESCHRIEBEN. Ein Query-Fehler hat damit
 * nicht nur eine Anzeige verfaelscht, sondern die gespeicherte Summe einer
 * Rechnung dauerhaft auf null gesetzt, ohne dass irgendwo etwas rot wurde.
 *
 * Auch der `update` war ungeprueft: schlug er fehl, blieb die alte Summe
 * stehen, waehrend die Positionen sich geaendert hatten.
 *
 * Beide werfen jetzt. Der Text nennt ausdruecklich, dass die Position bereits
 * gespeichert ist — sonst legt der Nutzer sie ein zweites Mal an. Was danach
 * offen bleibt (veraltete Summe), findet `findInvoiceDefects` als
 * `totals_mismatch` auf der Detailseite wieder.
 */
async function recalcDocumentTotals(
  table: 'offers' | 'invoices',
  column: 'offer_id' | 'invoice_id',
  documentId: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const itemsResult = await supabase
    .from('billing_line_items')
    .select('net_cents, tax_cents, gross_cents')
    .eq(column, documentId);
  if (itemsResult.error) {
    throw new Error(
      'Die Position wurde gespeichert, aber die Summe des Belegs konnte nicht neu ' +
        'berechnet werden — die angezeigte Summe ist veraltet. Bitte die Seite neu ' +
        'laden und die Summe prüfen, bevor der Beleg versendet wird.',
    );
  }

  // Kein `?? []` mehr: der Fehlerfall ist zwei Zeilen weiter oben behandelt,
  // und genau dieses Fallback war der Bug — es hat die leere Liste des
  // Fehlerfalls in eine Summe von 0 verwandelt.
  const totals = computeDocumentTotals(itemsResult.data);
  const update = await supabase.from(table).update(totals).eq('id', documentId);
  if (update.error) {
    throw new Error(
      'Die Position wurde gespeichert, aber die neue Summe konnte nicht in den Beleg ' +
        'geschrieben werden — die angezeigte Summe ist veraltet. Bitte die Seite neu ' +
        'laden und die Summe prüfen, bevor der Beleg versendet wird.',
    );
  }
}

async function recalcOfferTotals(offerId: string): Promise<void> {
  await recalcDocumentTotals('offers', 'offer_id', offerId);
}

async function recalcInvoiceTotals(invoiceId: string): Promise<void> {
  await recalcDocumentTotals('invoices', 'invoice_id', invoiceId);
}

export async function addLineItemAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const kind = String(formData.get('document_kind') ?? '');
  const parentId = String(formData.get('parent_id') ?? '');
  if (kind !== 'offer' && kind !== 'invoice') throw new Error('Ungültiger Beleg-Typ.');
  if (!parentId) throw new Error('Ungültige Beleg-ID.');

  const parsed = lineItemSchema.safeParse({
    description: formData.get('description') ?? '',
    quantity: formData.get('quantity') ?? 1,
    unit: formData.get('unit') ?? undefined,
    unit_price_cents: formData.get('unit_price_cents') ?? 0,
    tax_rate: formData.get('tax_rate') ?? 19,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');

  const totals = computeLineTotals(parsed.data);

  const supabase = await createSupabaseServerClient();
  const parentCol = kind === 'offer' ? 'offer_id' : 'invoice_id';

  // Sprint 107: `existing?.position ?? 0` hat aus einem Query-Fehler eine
  // neue Position 1 gemacht — auf einem Beleg, der bereits eine 1 hatte.
  // Doppelte Positionsnummern auf einer Rechnung sind nicht nur haesslich:
  // Rueckfragen ("Position 1 — welche der beiden?") laufen ins Leere.
  const existingResult = await supabase
    .from('billing_line_items')
    .select('position')
    .eq(parentCol, parentId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const existing = unwrapMaybeRow(existingResult, 'Beleg: höchste Positionsnummer');
  const nextPos = (existing?.position ?? 0) + 1;

  const { error } = await supabase.from('billing_line_items').insert({
    tenant_id: ctx.tenantId,
    document_kind: kind,
    offer_id: kind === 'offer' ? parentId : null,
    invoice_id: kind === 'invoice' ? parentId : null,
    position: nextPos,
    description: parsed.data.description,
    quantity: parsed.data.quantity,
    unit: parsed.data.unit,
    unit_price_cents: parsed.data.unit_price_cents,
    tax_rate: parsed.data.tax_rate,
    ...totals,
  });
  if (error) throw new Error(friendlyDbMessage(error.message));

  if (kind === 'offer') await recalcOfferTotals(parentId);
  else await recalcInvoiceTotals(parentId);

  revalidatePath(`/billing/${kind}s/${parentId}`);
}

export async function removeLineItemAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const itemId = String(formData.get('item_id') ?? '');
  const kind = String(formData.get('document_kind') ?? '');
  const parentId = String(formData.get('parent_id') ?? '');
  if (!itemId || !parentId || (kind !== 'offer' && kind !== 'invoice')) throw new Error('Ungültige Eingabe.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('billing_line_items').delete().eq('id', itemId);
  if (error) throw new Error(friendlyDbMessage(error.message));

  if (kind === 'offer') await recalcOfferTotals(parentId);
  else await recalcInvoiceTotals(parentId);

  revalidatePath(`/billing/${kind}s/${parentId}`);
}
