import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { unwrapRows, unwrapMaybeRow, SupabaseQueryError } from '@/lib/supabase/unwrap';
import { parseTenantAddress, parseTenantInvoiceData } from '@/lib/schemas/tenant';
import type { BillingDocumentData, BillingLine } from '@/lib/pdf/BillingDocument';

/**
 * Owner-scoped Rechnungs-Loader fuers Eigentümer-Portal.
 *
 * loadBillingDocumentData ist mandantengebunden (requireTenantContext) und
 * kann externe Eigentuemer nicht bedienen. Hier laeuft die AUTORISIERUNG ueber
 * den Owner-RLS-Client: invoices_select_owner liefert die Rechnung nur, wenn
 * sie dem angemeldeten Eigentuemer gehoert (owner_id-Match oder eigenes Objekt)
 * — und dann gleich mit allen Kopfdaten. Positionen (billing_line_items) und
 * Absender (tenants) haben bewusst keine Owner-Policy; sie werden mit dem
 * Service-Client gelesen, nachdem der Zugriff bereits bewiesen ist.
 *
 * Rueckgabe null = "nicht gefunden / nicht berechtigt" (-> 404). Ein echter
 * Query-Fehler wirft (unwrap*), sodass kein halbes Dokument beim Eigentuemer
 * landet (dieselbe Strenge wie loadBillingDocumentData).
 */
export async function loadOwnerInvoiceData(
  invoiceId: string,
  tenantId: string,
): Promise<BillingDocumentData | null> {
  const owner = await createSupabaseServerClient();

  const invoice = unwrapMaybeRow(
    await owner
      .from('invoices')
      .select(
        'code, title, description, bill_to_name, bill_to_address, issued_at, due_at, net_total_cents, tax_total_cents, gross_total_cents, notes, tenant_id',
      )
      .eq('id', invoiceId)
      .maybeSingle(),
    'Eigentümerportal: Rechnung',
  );
  if (!invoice) return null;

  // Defense-in-Depth: die Rechnung muss zum Mandanten des Eigentuemers
  // gehoeren. Der Owner-RLS-Read hat das bereits sichergestellt; diese Prüfung
  // pinnt den Absender zusätzlich auf den richtigen Mandanten fest.
  if (invoice.tenant_id !== tenantId) return null;

  const admin = createSupabaseServiceClient();

  const rawLines = unwrapRows(
    await admin
      .from('billing_line_items')
      .select(
        'position, description, quantity, unit, unit_price_cents, tax_rate, net_cents, tax_cents, gross_cents',
      )
      .eq('invoice_id', invoiceId)
      .order('position', { ascending: true }),
    'Eigentümerportal: Rechnungspositionen',
  );

  const tenant = unwrapMaybeRow(
    await admin.from('tenants').select('name, address, invoice_data').eq('id', tenantId).maybeSingle(),
    'Eigentümerportal: Absenderdaten',
  );
  if (!tenant) {
    throw new SupabaseQueryError('Eigentümerportal: Absenderdaten', {
      message: `Mandant ${tenantId} nicht lesbar, obwohl der Eigentümer-Kontext ihn bestätigt hat.`,
    });
  }

  const lines: BillingLine[] = rawLines.map((l) => ({
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
    kind: 'invoice',
    code: invoice.code,
    title: invoice.title,
    description: invoice.description,
    bill_to_name: invoice.bill_to_name,
    bill_to_address: invoice.bill_to_address,
    issued_at: invoice.issued_at,
    due_at: invoice.due_at,
    valid_until: null,
    net_total_cents: invoice.net_total_cents,
    tax_total_cents: invoice.tax_total_cents,
    gross_total_cents: invoice.gross_total_cents,
    notes: invoice.notes,
    lines,
    tenant: {
      name: tenant.name,
      address: parseTenantAddress(tenant.address),
      invoiceData: parseTenantInvoiceData(tenant.invoice_data),
    },
  };
}
