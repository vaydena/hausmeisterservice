import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/current';
import { parseTenantAddress, parseTenantInvoiceData } from '@/lib/schemas/tenant';
import type { BillingDocumentData, BillingKind, BillingLine } from './BillingDocument';

/**
 * Lädt Rechnung/Angebot + Positionen + Tenant-Absender aus der DB und
 * baut die serialisierbare Daten-Struktur für BillingDocument.
 * RLS filtert automatisch auf den aktuellen Mandanten.
 */
export async function loadBillingDocumentData(
  kind: BillingKind,
  id: string,
): Promise<BillingDocumentData | null> {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  let docBase: {
    code: string;
    title: string;
    description: string | null;
    bill_to_name: string;
    bill_to_address: string | null;
    issued_at: string | null;
    due_at: string | null;
    valid_until: string | null;
    net_total_cents: number;
    tax_total_cents: number;
    gross_total_cents: number;
    notes: string | null;
  } | null = null;

  if (kind === 'invoice') {
    const { data, error } = await supabase
      .from('invoices')
      .select(
        'code, title, description, bill_to_name, bill_to_address, issued_at, due_at, net_total_cents, tax_total_cents, gross_total_cents, notes',
      )
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    docBase = { ...data, valid_until: null };
  } else {
    const { data, error } = await supabase
      .from('offers')
      .select(
        'code, title, description, bill_to_name, bill_to_address, issued_at, valid_until, net_total_cents, tax_total_cents, gross_total_cents, notes',
      )
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    docBase = { ...data, due_at: null };
  }

  const lineFilter = kind === 'invoice' ? 'invoice_id' : 'offer_id';
  const { data: rawLines } = await supabase
    .from('billing_line_items')
    .select(
      'position, description, quantity, unit, unit_price_cents, tax_rate, net_cents, tax_cents, gross_cents',
    )
    .eq(lineFilter, id)
    .order('position', { ascending: true });

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, address, invoice_data')
    .eq('id', ctx.tenantId)
    .maybeSingle();

  const lines: BillingLine[] = (rawLines ?? []).map((l) => ({
    position: l.position,
    description: l.description,
    quantity: Number(l.quantity),
    unit: l.unit,
    unit_price_cents: l.unit_price_cents,
    tax_rate: Number(l.tax_rate),
    net_cents: l.net_cents,
    tax_cents: l.tax_cents,
    gross_cents: l.gross_cents,
  }));

  return {
    kind,
    ...docBase,
    lines,
    tenant: {
      name: tenant?.name ?? 'Ihr Unternehmen',
      address: parseTenantAddress(tenant?.address),
      invoiceData: parseTenantInvoiceData(tenant?.invoice_data),
    },
  };
}
