import { NextResponse } from 'next/server';
import { pdf } from '@react-pdf/renderer';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getBankDetails } from '@/lib/platform/bank-transfer';
import { PlatformInvoiceDocument, type PlatformInvoiceData } from '@/lib/pdf/PlatformInvoiceDocument';
import { createPlatformServiceClient } from '@/lib/supabase/platform';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const service = createSupabaseServiceClient();
  // Sprint 116: `iErr || !invoice` warf Stoerung und "gibt es nicht" in
  // denselben Topf und antwortete beides mit 404. Der Mandant klickte auf
  // seine Rechnung und bekam gesagt, sie existiere nicht. unwrapMaybeRow
  // trennt beides: nur der echte Leerfall wird zur 404.
  const invoice = unwrapMaybeRow(
    await createPlatformServiceClient().from('invoices').select('*').eq('id', id).maybeSingle(),
    'Plattform-Rechnung: Beleg',
  );
  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Access: Platform-Admin oder Tenant-Owner der zugehörigen Agentur.
  // Beide Abfragen entscheiden fail-closed: ein verschluckter Fehler wurde
  // zu einem 403 und damit zu der Aussage "Sie duerfen Ihre eigene Rechnung
  // nicht sehen" — eine Rechtebegruendung fuer eine Stoerung.
  const adminRow = unwrapMaybeRow(
    await createPlatformServiceClient()
      .from('admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle(),
    'Plattform-Rechnung: Admin-Pruefung',
  );

  let allowed = !!adminRow;
  if (!allowed) {
    const ownership = unwrapMaybeRow(
      await service
        .from('memberships')
        .select('id')
        .eq('user_id', user.id)
        .eq('tenant_id', invoice.tenant_id)
        .eq('is_owner', true)
        .eq('status', 'active')
        .maybeSingle(),
      'Plattform-Rechnung: Inhaber-Pruefung',
    );
    allowed = !!ownership;
  }
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Empfaenger und Tarifname stehen auf dem Beleg. Fielen sie aus, ging die
  // Rechnung mit "—" als Rechnungsempfaenger und "Abo" statt des gebuchten
  // Tarifs raus — ein Dokument, das wie eine gueltige Rechnung aussieht.
  const tenant = unwrapMaybeRow(
    await service.from('tenants').select('name, address').eq('id', invoice.tenant_id).maybeSingle(),
    'Plattform-Rechnung: Rechnungsempfaenger',
  );
  const plan = unwrapMaybeRow(
    await createPlatformServiceClient()
      .from('subscription_plans')
      .select('name')
      .eq('id', invoice.plan_id)
      .maybeSingle(),
    'Plattform-Rechnung: Tarifname',
  );

  const addressStr = formatAddress(invoice.billing_address ?? tenant?.address);

  const data: PlatformInvoiceData = {
    invoiceNumber: invoice.invoice_number,
    issuedAt: invoice.issued_at,
    dueAt: invoice.due_at,
    periodStart: invoice.period_start,
    periodEnd: invoice.period_end,
    planName: plan?.name ?? 'Abo',
    planInterval: invoice.plan_interval as 'monthly' | 'yearly',
    subtotalCents: invoice.subtotal_cents,
    totalCents: invoice.total_cents,
    currency: invoice.currency,
    paymentMethod: invoice.payment_method as 'bank_transfer' | 'stripe',
    paidAt: invoice.paid_at,
    paymentReference: invoice.payment_reference,
    billTo: {
      name: tenant?.name ?? '—',
      address: addressStr,
    },
    bank: invoice.payment_method === 'bank_transfer' ? getBankDetails() : null,
  };

  const buffer = await pdf(<PlatformInvoiceDocument data={data} />).toBuffer();
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoice.invoice_number}.pdf"`,
    },
  });
}

function formatAddress(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof a.street === 'string') lines.push(a.street);
  const zip = typeof a.zip === 'string' ? a.zip : '';
  const city = typeof a.city === 'string' ? a.city : '';
  const zipCity = `${zip} ${city}`.trim();
  if (zipCity) lines.push(zipCity);
  return lines.join('\n') || null;
}
