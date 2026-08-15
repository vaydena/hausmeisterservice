import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/current';
import { unwrapRows, unwrapMaybeRow, SupabaseQueryError } from '@/lib/supabase/unwrap';
import { parseTenantAddress, parseTenantInvoiceData } from '@/lib/schemas/tenant';
import type { BillingDocumentData, BillingKind, BillingLine } from './BillingDocument';

/**
 * Lädt Rechnung/Angebot + Positionen + Tenant-Absender aus der DB und
 * baut die serialisierbare Daten-Struktur für BillingDocument.
 * RLS filtert automatisch auf den aktuellen Mandanten.
 *
 * Sprint 107: Diese Funktion speist zwei Wege — den Download-Button und den
 * PDF-Anhang der ausgehenden E-Mail (billing/email-actions.ts). Ein
 * verschluckter Query-Fehler wurde hier deshalb nicht zu einer leeren Seite,
 * sondern zu einem Dokument, das beim Kunden landet. Zwei Faelle waren
 * besonders teuer:
 *
 *   1. Positionen-Query fehlgeschlagen -> `(rawLines ?? [])`. Die Summen
 *      kommen aus dem Kopfsatz, die Umsatzsteuerzeile dagegen wird aus den
 *      Positionen aggregiert. Ergebnis: "Zwischensumme 1.000,00 €" und
 *      "Gesamtbetrag 1.190,00 €", dazwischen nichts — keine Position, keine
 *      ausgewiesene Steuer. Nach §14 Abs. 4 UStG keine gueltige Rechnung.
 *   2. Tenant-Query fehlgeschlagen -> `tenant?.name ?? 'Ihr Unternehmen'`.
 *      Die Rechnung ging unter dem Absender "Ihr Unternehmen" raus, ohne
 *      Anschrift, ohne Steuernummer und ohne IBAN — mit einem Zahlungshinweis,
 *      der zur Ueberweisung auffordert, aber kein Konto nennt.
 *
 * Beide werfen jetzt. Fuer den Download-Handler heisst das HTTP 500 statt
 * PDF, fuer den Versand einen Abbruch vor dem Senden: kein Dokument ist in
 * beiden Faellen besser als ein falsches, denn nur das falsche ist nicht
 * mehr einzusammeln.
 *
 * Der Fallback 'Ihr Unternehmen' ist ersatzlos entfallen. Er hat einen
 * Datenmangel in ein auslieferbares Dokument uebersetzt — genau das, was
 * hier nicht mehr passieren soll.
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

  // `null` heisst ab hier ausschliesslich "gibt es nicht" (-> 404 beim
  // Aufrufer). Vorher lief auch jede gescheiterte Query hier hinein und kam
  // beim Nutzer als "Rechnung nicht gefunden." an — eine Auskunft, die zum
  // Loeschen des vermeintlich verwaisten Datensatzes einlaedt.
  if (kind === 'invoice') {
    const result = await supabase
      .from('invoices')
      .select(
        'code, title, description, bill_to_name, bill_to_address, issued_at, due_at, net_total_cents, tax_total_cents, gross_total_cents, notes',
      )
      .eq('id', id)
      .maybeSingle();
    const data = unwrapMaybeRow(result, 'Beleg-PDF: Rechnung');
    if (!data) return null;
    docBase = { ...data, valid_until: null };
  } else {
    const result = await supabase
      .from('offers')
      .select(
        'code, title, description, bill_to_name, bill_to_address, issued_at, valid_until, net_total_cents, tax_total_cents, gross_total_cents, notes',
      )
      .eq('id', id)
      .maybeSingle();
    const data = unwrapMaybeRow(result, 'Beleg-PDF: Angebot');
    if (!data) return null;
    docBase = { ...data, due_at: null };
  }

  const lineFilter = kind === 'invoice' ? 'invoice_id' : 'offer_id';
  const linesResult = await supabase
    .from('billing_line_items')
    .select(
      'position, description, quantity, unit, unit_price_cents, tax_rate, net_cents, tax_cents, gross_cents',
    )
    .eq(lineFilter, id)
    .order('position', { ascending: true });
  const rawLines = unwrapRows(linesResult, 'Beleg-PDF: Positionen');

  const tenantResult = await supabase
    .from('tenants')
    .select('name, address, invoice_data')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  const tenant = unwrapMaybeRow(tenantResult, 'Beleg-PDF: Absenderdaten des Mandanten');
  if (!tenant) {
    // requireTenantContext() hat den Mandanten gerade bestaetigt. Ist die
    // Zeile trotzdem nicht lesbar, stimmt etwas Grundsaetzliches nicht (RLS,
    // geloeschter Mandant) — und dann darf kein Beleg entstehen, der so tut,
    // als haette er einen Aussteller.
    throw new SupabaseQueryError('Beleg-PDF: Absenderdaten des Mandanten', {
      message: `Mandant ${ctx.tenantId} nicht lesbar, obwohl der Kontext ihn bestätigt hat.`,
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
    kind,
    ...docBase,
    lines,
    tenant: {
      name: tenant.name,
      address: parseTenantAddress(tenant.address),
      invoiceData: parseTenantInvoiceData(tenant.invoice_data),
    },
  };
}
